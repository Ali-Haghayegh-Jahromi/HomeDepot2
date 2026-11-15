#!/usr/bin/env python3
"""The robot service: the small API between n8n and the robot.

One Python process: FastAPI (the HTTP endpoints) + rclpy + Nav2 Simple
Commander (BasicNavigator.goToPose). Formats are in API_CONTRACT.md, part B.

    n8n  --POST /tour/start {one stop}-->  this service  --goToPose-->  Nav2
    n8n  <--POST /robot/event near|arrived|home--  this service

Settings (environment variables):
    HD_MODE           ros (default) or mock (no robot: it pretends to drive)
    HD_N8N_URL        where n8n is (default http://localhost:5678)
    HD_NEAR_M         "near" distance in metres (default 5)
    HD_PORT           port of this service (default 8000)
    HD_MOCK_SPEED     mock mode driving speed in m/s (default 2)
    HD_LOG_FILE       the structured log (default <repo>/logs/robot_service.jsonl)
    HD_REACHED_M      Nav2 gave up within this distance of a stop: counts as reached (default 2)
    HD_DEMO_DIR       the pages served at /demo/ (default ui/dist if built, else demo/)

Logs: the human-readable lines go to stdout (logs/robot_service.log); the same story, plus more,
goes as one JSON object per line to logs/robot_service.jsonl (read it with tools/log_check.py,
or GET /logs). The demo pages add their own entries with POST /log.
"""
import json
import logging
import math
import os
import queue
import sys
import threading
import time
import traceback
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

import requests
import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.encoders import jsonable_encoder
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'store'))
import layout  # noqa: E402

MODE = os.environ.get('HD_MODE', 'ros')
N8N_URL = os.environ.get('HD_N8N_URL', 'http://localhost:5678')
N8N_EVENT_URL = N8N_URL + '/webhook/robot/event'
_REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
# the pages served at /demo/: HD_DEMO_DIR, else the built React UI (ui/dist) if there is one, else the old demo/ pages
DEMO_DIR = os.environ.get('HD_DEMO_DIR') or (os.path.join(_REPO, 'ui', 'dist')
                                              if os.path.isfile(os.path.join(_REPO, 'ui', 'dist', 'index.html'))
                                              else os.path.join(_REPO, 'demo'))
NEAR_M = float(os.environ.get('HD_NEAR_M', '5'))
PORT = int(os.environ.get('HD_PORT', '8000'))
MOCK_SPEED = float(os.environ.get('HD_MOCK_SPEED', '2'))
HOME = layout.HOME                       # the dock beside the kiosk
MAX_ATTEMPTS = 3                         # Nav2 goal retries before giving up
REACHED_M = float(os.environ.get('HD_REACHED_M', '2'))   # Nav2 gave up this close to the stop: counts as reached

logging.basicConfig(level=logging.INFO, format='%(asctime)s  %(message)s', datefmt='%H:%M:%S')
log = logging.getLogger('robot_service')


# =========================================================================
# Structured log: one JSON object per line, same fields as the event_log table
#   {"ts", "source", "level", "session_id", "event", "details", "duration_ms"?}
# Best-effort: a logging problem never breaks an endpoint or the robot.
# =========================================================================
JSONL = os.environ.get('HD_LOG_FILE') or os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'logs', 'robot_service.jsonl'))
JSONL_MAX_BYTES = 50 * 1024 * 1024       # bigger than this at start-up: moved to robot_service.jsonl.1
_jlock = threading.Lock()
_jlines = 0                              # lines in the file (the line number of the newest entry)


def _now_iso():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds')


def _jsonl_open():
    global _jlines
    try:
        os.makedirs(os.path.dirname(JSONL), exist_ok=True)
        if os.path.exists(JSONL) and os.path.getsize(JSONL) > JSONL_MAX_BYTES:
            os.replace(JSONL, JSONL + '.1')
        if not os.path.exists(JSONL):
            open(JSONL, 'a').close()
            os.chmod(JSONL, 0o666)       # the service runs as root in the container; let the PC's user clean up too
        with open(JSONL, 'rb') as f:
            _jlines = sum(1 for _ in f)
    except Exception as error:
        log.warning(f'structured log {JSONL} not usable: {error}')


def jlog(event, level='info', session_id=None, source='robot', duration_ms=None, details_dict=None, **details):
    """Writes one structured log entry. Never raises."""
    global _jlines
    try:
        entry = {'ts': _now_iso(), 'source': source, 'level': level, 'session_id': session_id, 'event': event,
                 'details': {**(details_dict or {}), **details}}
        if duration_ms is not None:
            entry['duration_ms'] = int(round(duration_ms))
        line = json.dumps(entry, default=str, ensure_ascii=False)
        with _jlock:
            with open(JSONL, 'a', encoding='utf-8') as f:
                f.write(line + '\n')
            _jlines += 1
    except Exception:
        pass


def read_jsonl(since=None, session_id=None, limit=500, level=None):
    """Entries of the structured log, each with its line number, oldest first."""
    since_line, since_ts = None, None
    if since:
        if str(since).isdigit():
            since_line = int(since)
        else:
            try:
                since_ts = datetime.fromisoformat(str(since).replace('Z', '+00:00'))
                if since_ts.tzinfo is None:
                    since_ts = since_ts.replace(tzinfo=timezone.utc)
            except ValueError:
                pass
    entries, last = [], 0
    try:
        with open(JSONL, encoding='utf-8', errors='replace') as f:
            for number, text in enumerate(f, 1):
                last = number
                if since_line is not None and number <= since_line:
                    continue
                try:
                    entry = json.loads(text)
                except ValueError:
                    continue
                if session_id and entry.get('session_id') != session_id:
                    continue
                if level and entry.get('level') not in {'info': ('info', 'warn', 'error'), 'warn': ('warn', 'error'),
                                                        'error': ('error',)}.get(level, (level,)):
                    continue
                if since_ts is not None:
                    try:
                        if datetime.fromisoformat(entry['ts'].replace('Z', '+00:00')) <= since_ts:
                            continue
                    except (KeyError, ValueError):
                        continue
                entry['line'] = number
                entries.append(entry)
    except FileNotFoundError:
        pass
    return entries[-limit:] if limit and limit > 0 else entries, last


def summary(stop):
    """The few fields of a stop worth logging."""
    return None if not stop else {k: stop.get(k) for k in ('sku', 'tag_code', 'aisle', 'shelf', 'x', 'y')}


# =========================================================================
# Drivers: how the service moves the robot and shows the shelf lights
# =========================================================================
class MockDriver:
    """No robot at all: moves a pretend robot in a straight line."""
    name = 'mock'

    def __init__(self):
        self.x, self.y, self.yaw = HOME['x'], HOME['y'], HOME['yaw']
        self.target, self.last = None, time.time()

    def start(self):
        pass

    def ready(self):
        return True

    def go(self, x, y, yaw):
        self.target, self.last = (x, y, yaw), time.time()

    def cancel(self):
        self.target = None

    def poll(self):
        """None while driving, True on arrival, False on failure."""
        if self.target is None:
            return True
        now = time.time()
        step, self.last = MOCK_SPEED * (now - self.last), now
        dx, dy = self.target[0] - self.x, self.target[1] - self.y
        dist = math.hypot(dx, dy)
        if dist <= step:
            self.x, self.y, self.yaw = self.target
            self.target = None
            return True
        self.x, self.y, self.yaw = self.x + dx / dist * step, self.y + dy / dist * step, math.atan2(dy, dx)
        return None

    def pose(self):
        return self.x, self.y, self.yaw

    def show_lights(self, lights):
        pass

    def show_target(self, stop):
        pass


class RosDriver:
    """The real thing: Nav2 through BasicNavigator, pose from TF, lights as RViz markers."""
    name = 'ros'

    def __init__(self):
        self._ready = False
        self._lights = {}
        self._target = None                  # the stop the robot is guiding to (drawn in RViz)

    def start(self):
        import rclpy
        from nav2_simple_commander.robot_navigator import BasicNavigator
        from rclpy.executors import SingleThreadedExecutor
        from rclpy.qos import DurabilityPolicy, QoSProfile
        from tf2_ros import Buffer, TransformListener
        from visualization_msgs.msg import MarkerArray

        rclpy.init()
        self.rclpy = rclpy
        self.nav = BasicNavigator()                       # sends the goals (used by the worker thread only)
        self.node = rclpy.create_node('hd_robot_service')  # reads the pose, draws the lights
        self.tf_buffer = Buffer()
        self.tf_listener = TransformListener(self.tf_buffer, self.node)
        self.light_pub = self.node.create_publisher(
            MarkerArray, 'shelf_lights', QoSProfile(depth=1, durability=DurabilityPolicy.TRANSIENT_LOCAL))
        self.node.create_timer(0.1, self._publish_lights)   # 10 Hz: a smooth pulse of the lit shelf tag
        executor = SingleThreadedExecutor()
        executor.add_node(self.node)
        threading.Thread(target=executor.spin, daemon=True).start()
        threading.Thread(target=self._wait_for_nav2, daemon=True).start()

    def _wait_for_nav2(self):
        log.info('Waiting for Nav2 (start the simulation with ./run.sh sim) ...')
        t0 = time.time()
        # Not BasicNavigator.waitUntilNav2Active(localizer='amcl'): in Humble it publishes its own default start
        # pose (0, 0) on /initialpose until it hears from AMCL, which throws AMCL's estimate away every time this
        # service restarts while the robot is somewhere else. AMCL gets its start pose (the dock) from the
        # simulation's launch file; here we only wait for AMCL to be active and to localize (map -> base_link).
        self.nav._waitForNodeToActivate('amcl')
        waited = 0
        while self.pose() is None:
            if waited % 20 == 0:
                log.info('Waiting for AMCL to localize the robot (map -> base_link) ...')
            time.sleep(0.5)
            waited += 1
        self.nav.initial_pose_received = True             # never let BasicNavigator set a start pose
        self.nav._waitForNodeToActivate('bt_navigator')
        self._ready = True
        log.info('Nav2 is ready: the robot can take goals')
        pose = self.pose()
        jlog('nav2_ready', waited_s=round(time.time() - t0, 1),
             pose=None if not pose else {'x': round(pose[0], 2), 'y': round(pose[1], 2), 'yaw': round(pose[2], 2)},
             home={'x': HOME['x'], 'y': HOME['y']})

    def ready(self):
        return self._ready

    def go(self, x, y, yaw):
        from geometry_msgs.msg import PoseStamped
        goal = PoseStamped()
        goal.header.frame_id = 'map'
        goal.header.stamp = self.nav.get_clock().now().to_msg()
        goal.pose.position.x, goal.pose.position.y = float(x), float(y)
        goal.pose.orientation.z, goal.pose.orientation.w = math.sin(yaw / 2), math.cos(yaw / 2)
        self._accepted = self.nav.goToPose(goal)

    def cancel(self):
        self.nav.cancelTask()

    def poll(self):
        from nav2_simple_commander.robot_navigator import TaskResult
        if not self._accepted:
            return False
        if not self.nav.isTaskComplete():
            return None
        return self.nav.getResult() == TaskResult.SUCCEEDED

    def pose(self):
        from rclpy.time import Time
        try:
            t = self.tf_buffer.lookup_transform('map', 'base_link', Time()).transform
        except Exception:                                  # no localization yet
            return None
        q = t.rotation
        return t.translation.x, t.translation.y, math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z))

    def show_lights(self, lights):
        self._lights = {code: dict(light) for code, light in lights.items()}

    def show_target(self, stop):
        self._target = dict(stop) if stop else None

    def _publish_lights(self):
        # a drawing problem must never stop the executor thread (it also feeds TF, i.e. the pose)
        try:
            self._draw_markers()
        except Exception as error:                          # noqa: BLE001
            if not getattr(self, '_draw_failed', False):
                self._draw_failed = True
                log.warning(f'RViz markers not drawn: {error!r}')
                jlog('markers_failed', 'warn', error=repr(error)[:300])

    def _draw_markers(self):
        """RViz markers for the visit, redrawn 10 times a second: every known shelf tag (a small grey
        lamp when off, a bright pulsing green one when on) and, for the stop the robot is guiding to,
        the bay highlighted in the store's orange, its aisle sign, a label, and the 5 m ring in which
        the shelf light turns on. Colours are the web UI's (ui/themes/aisle)."""
        from visualization_msgs.msg import Marker, MarkerArray
        from geometry_msgs.msg import Point
        stamp = self.node.get_clock().now().to_msg()
        clear = Marker()
        clear.action = Marker.DELETEALL
        markers = [clear]
        pulse = 0.5 + 0.5 * math.sin(time.time() * 5.0)
        top = os.environ.get('HD_RVIZ_VIEW', 'top').lower() != '3d'
        accent, ink, paper = (0.78, 0.306, 0.0), (0.04, 0.07, 0.09), (1.0, 1.0, 1.0)
        green = (0.082, 0.502, 0.239)

        def add(kind, x, y, z, size, rgba, text='', ns='shelf_lights', points=None):
            m = Marker()
            m.header.frame_id, m.header.stamp = 'map', stamp
            m.ns, m.id, m.type, m.action = ns, len(markers), kind, Marker.ADD
            m.pose.position.x, m.pose.position.y, m.pose.position.z = float(x), float(y), float(z)
            m.pose.orientation.w = 1.0
            m.scale.x, m.scale.y, m.scale.z = (float(v) for v in size)
            m.color.r, m.color.g, m.color.b, m.color.a = (float(v) for v in rgba)
            m.text = text
            if points:
                m.points = [Point(x=float(px), y=float(py), z=0.0) for px, py in points]
            markers.append(m)

        target = self._target
        if target and top:
            tx, ty = target['x'], target['y']
            lx, ly = target.get('light_x', tx), target.get('light_y', ty)
            # the 5 m ring: inside it the shelf light turns on
            add(Marker.CYLINDER, tx, ty, 0.07, (2 * NEAR_M, 2 * NEAR_M, 0.01), (*green, 0.10), ns='near_ring')
            ring = [(tx + NEAR_M * math.cos(a * math.pi / 36), ty + NEAR_M * math.sin(a * math.pi / 36)) for a in range(73)]
            add(Marker.LINE_STRIP, 0, 0, 0.09, (0.16, 0, 0), (*green, 0.95), ns='near_ring', points=ring)
            # the bay: the rack section beside the light, outlined (dark; bright green once its light is
            # on) and filled orange, on top of the rack
            west = lx < tx
            cx = lx - layout.RACK_DEPTH / 2 if west else lx + layout.RACK_DEPTH / 2
            lit = any(light.get('on') and abs(light['x'] - lx) < 0.01 and abs(light['y'] - ly) < 0.01
                      for light in self._lights.values())
            rim = 0.5 if lit else 0.3
            add(Marker.CUBE, cx, ly, 3.70, (layout.RACK_DEPTH + rim, layout.BAY_LENGTH + rim, 0.04),
                (0.13, 0.9, 0.35, 1.0) if lit else (*ink, 1.0), ns='target_bay')
            add(Marker.CUBE, cx, ly, 3.74, (layout.RACK_DEPTH, layout.BAY_LENGTH, 0.04), (*accent, 1.0), ns='target_bay')
            # its aisle's signs turn orange, as on the web map
            aisle = target.get('aisle')
            if aisle in layout.DEPARTMENTS:
                for sy in (layout.FRONT_Y0 - 1.25, layout.BACK_Y1 + 1.25):
                    add(Marker.CYLINDER, layout.aisle_x(aisle), sy, 4.72, (1.95, 1.95, 0.05), (*accent, 1.0), ns='target_aisle')
            # a label: the item and where it is, on a white plate beside the bay
            name = str(target.get('name') or target.get('sku') or '')
            name = name if len(name) <= 24 else name[:23].rstrip() + '...'
            where = f"Aisle {target.get('aisle')}, bay {target.get('shelf')}"
            px = min(max(lx, 7.5), layout.WIDTH - 7.5)
            py = ly + 3.1 if ly < layout.BACK_Y1 - 3 else ly - 3.1
            width = max(len(name), len(where)) * 0.78 * 0.62 + 1.0   # RViz draws spaces wide
            add(Marker.CUBE, px, py, 4.80, (width + 0.3, 2.5, 0.04), (*accent, 1.0), ns='target_label')
            add(Marker.CUBE, px, py, 4.84, (width, 2.2, 0.04), (*paper, 1.0), ns='target_label')
            add(Marker.TEXT_VIEW_FACING, px, py, 4.95, (0.0, 0.0, 0.78), (*ink, 1.0), f'{name}\n{where}', ns='target_label')

        for code, light in self._lights.items():
            x, y, z = light['x'], light['y'], light['z']
            if top:
                z = 3.9          # above the racks, so the top view sees all of it
            if light['on'] and top:
                # a strong, pulsing green light: a wide soft glow, a ring that breathes, a bright lamp
                glow = 2.6 + 1.4 * pulse
                add(Marker.CYLINDER, x, y, z - 0.1, (glow, glow, 0.04), (0.13, 0.9, 0.35, 0.55 - 0.3 * pulse))
                r = 1.0 + 0.9 * pulse
                ring = [(x + r * math.cos(a * math.pi / 18), y + r * math.sin(a * math.pi / 18)) for a in range(37)]
                add(Marker.LINE_STRIP, 0, 0, z + 0.05, (0.14, 0, 0), (*green, 1.0), points=ring)
                add(Marker.SPHERE, x, y, z + 0.1, (0.95, 0.95, 0.2), (0.13, 0.95, 0.35, 1.0))
            elif light['on']:
                glow = 0.7 + 0.6 * pulse
                add(Marker.SPHERE, x, y, z, (0.3, 0.3, 0.3), (0.1, 1.0, 0.2, 1.0))
                add(Marker.SPHERE, x, y, z, (glow, glow, glow), (0.1, 1.0, 0.2, 0.35))
                add(Marker.CYLINDER, x, y, z / 2, (0.06, 0.06, z), (0.1, 1.0, 0.2, 0.5))      # beam down to the floor
                add(Marker.TEXT_VIEW_FACING, x, y, z + 0.9, (0.0, 0.0, 0.4), (0.1, 1.0, 0.2, 1.0), light.get('label', code))
            else:
                add(Marker.SPHERE, x, y, z, (0.45, 0.45, 0.45) if top else (0.22, 0.22, 0.22), (0.55, 0.55, 0.55, 0.9))
        self.light_pub.publish(MarkerArray(markers=markers))


# =========================================================================
# The tour: what the robot is doing for the current customer
# =========================================================================
class Tour:
    def __init__(self, driver):
        self.driver = driver
        self.lock = threading.Lock()
        self.state = 'idle'            # idle | navigating | waiting_for_pick | returning_home | done
        self.session_id = None
        self.index = self.total = 0
        self.current_item = None
        self.distance_m = None
        self.lights = {}               # tag_code -> {x, y, z, on, label}
        self.command = None            # the newest order for the worker, or None
        self.goal = None               # what the robot is driving to now (its 'near_sent' flag lives in it)

    # ---- structured log of state changes (call with the lock held)
    def _set_state(self, new, why, session_id=None, **details):
        old, self.state = self.state, new
        if old != new or details.get('force'):
            details.pop('force', None)
            jlog('state_change', session_id=session_id or self.session_id, **{'from': old, 'to': new, 'why': why,
                 'sku': (self.current_item or {}).get('sku'), 'index': self.index, 'total': self.total, **details})

    # ---- called by the HTTP endpoints
    def start(self, session_id, index, total, stop):
        with self.lock:
            previous = {'state': self.state, 'session_id': self.session_id, 'sku': (self.current_item or {}).get('sku')}
            self.session_id, self.index, self.total = session_id, index, total
            self.current_item, self.distance_m = stop, None
            self._set_state('navigating', 'tour/start', force=True, previous=previous)
            self.lights.setdefault(stop['tag_code'], {'on': False}).update(
                x=stop['light_x'], y=stop['light_y'], z=stop['light_z'], label=stop['name'][:40])
            # "near" is reported once per goal: the flag belongs to this goal, not to the tour
            self.command = {'kind': 'item', 'session_id': session_id, 'stop': stop,
                            'x': stop['x'], 'y': stop['y'], 'yaw': stop['yaw'], 'near_sent': False}
            self.driver.show_lights(self.lights)
            self.driver.show_target(stop)
        log.info(f'[{session_id}] item {index}/{total}: {stop["name"]} -> aisle {stop["aisle"]}, bay {stop["shelf"]}')

    def picked(self, session_id=None):
        with self.lock:
            if self.state == 'waiting_for_pick':
                self._set_state('idle', 'tour/next')
                log.info(f'[{self.session_id}] item picked up; waiting for the next order')
            else:
                jlog('pick_ignored', 'warn', session_id or self.session_id, state=self.state,
                     robot_session=self.session_id, sku=(self.current_item or {}).get('sku'),
                     note='/tour/next arrived while the robot was not waiting at a shelf')

    def go_home(self, session_id, reason):
        with self.lock:
            previous_session = self.session_id
            lit = sorted(code for code, light in self.lights.items() if light.get('on'))
            self.session_id = session_id or self.session_id
            self.index = self.total = 0
            self.current_item, self.distance_m = None, None
            self._set_state('returning_home', 'tour/done', reason=reason, previous_session=previous_session,
                            lights_cleared=lit)
            self.lights.clear()
            self.driver.show_lights(self.lights)
            self.driver.show_target(None)
            self.command = {'kind': 'home', 'session_id': self.session_id, **HOME}
        log.info(f'[{self.session_id}] visit over ({reason}): returning to the dock')

    def light(self, tag_code, on, position=None):
        with self.lock:
            known = tag_code in self.lights or position is not None
            was_on = bool(self.lights.get(tag_code, {}).get('on'))
            if known:
                entry = self.lights.setdefault(tag_code, {'label': tag_code})
                entry['on'] = on
                if position:
                    entry.update(position)
            self.driver.show_lights(self.lights)
            item = self.current_item or {}
            jlog('light', 'info' if known else 'warn', self.session_id, tag_code=tag_code, on=on, was_on=was_on,
                 drawn=known, robot_state=self.state, current_tag=item.get('tag_code'), current_sku=item.get('sku'),
                 distance_m=None if self.distance_m is None else round(self.distance_m, 2))
        log.info(f'shelf tag {tag_code}: light {"ON" if on else "off"}' + ('' if known else ' (position unknown: not drawn)'))
        return known

    def status(self):
        pose = self.driver.pose()
        with self.lock:
            return {
                'state': self.state, 'session_id': self.session_id, 'index': self.index, 'total': self.total,
                'current_item': self.current_item,
                'distance_m': None if self.distance_m is None else round(self.distance_m, 2),
                'pose': None if pose is None else {'x': round(pose[0], 2), 'y': round(pose[1], 2), 'yaw': round(pose[2], 2)},
                'lights_on': sorted(code for code, light in self.lights.items() if light['on']),
            }

    # ---- the worker thread: drives the robot and reports to n8n
    def run(self):
        attempts = 0
        goal_t0 = 0.0

        def pose_dict(pose):
            return None if not pose else {'x': round(pose[0], 2), 'y': round(pose[1], 2), 'yaw': round(pose[2], 2)}

        def goal_log(event, level, goal, **details):
            jlog(event, level, goal['session_id'], kind=goal['kind'], sku=(goal.get('stop') or {}).get('sku'),
                 goal={'x': round(goal['x'], 2), 'y': round(goal['y'], 2), 'yaw': round(goal['yaw'], 2)}, **details)

        last_pose, last_pose_t = None, 0.0
        while True:
            time.sleep(0.1)
            if not self.driver.ready():
                continue
            if time.time() - last_pose_t >= 1.0:          # structured log: a sudden jump means localization was reset
                try:
                    pose_now, last_pose_t = self.driver.pose(), time.time()
                    if pose_now and last_pose and math.hypot(pose_now[0] - last_pose[0], pose_now[1] - last_pose[1]) > 1.5:
                        jlog('pose_jump', 'error', self.session_id, before=pose_dict(last_pose), after=pose_dict(pose_now),
                             jump_m=round(math.hypot(pose_now[0] - last_pose[0], pose_now[1] - last_pose[1]), 2),
                             state=self.state, note='the robot cannot move this far in a second: localization (AMCL) was reset')
                    last_pose = pose_now or last_pose
                except Exception:
                    pass
            with self.lock:
                command, self.command = self.command, None
            try:
                if command:
                    if self.goal:
                        goal_log('nav_goal_cancelled', 'info', self.goal, replaced_by=command['kind'],
                                 replaced_by_sku=(command.get('stop') or {}).get('sku'),
                                 after_s=round(time.time() - goal_t0, 1), pose=pose_dict(self.driver.pose()))
                        self.driver.cancel()
                    self.goal, attempts, goal_t0 = command, 1, time.time()
                    self.driver.go(command['x'], command['y'], command['yaw'])
                    goal_log('nav_goal_sent', 'info', command, attempt=1, accepted=getattr(self.driver, '_accepted', True),
                             pose=pose_dict(self.driver.pose()))
                if not self.goal:
                    continue
                goal, result, pose = self.goal, self.driver.poll(), self.driver.pose()
                if goal['kind'] == 'item' and pose:
                    distance = math.hypot(goal['x'] - pose[0], goal['y'] - pose[1])
                    with self.lock:
                        current = self.command is None          # no newer order waiting to replace this goal
                        if current:
                            self.distance_m = distance
                        if current and distance <= NEAR_M and not goal.get('near_sent'):
                            goal['near_sent'] = True
                            goal_log('near', 'info', goal, distance_m=round(distance, 2), near_m=NEAR_M,
                                     pose=pose_dict(pose), tag_code=goal['stop']['tag_code'],
                                     after_s=round(time.time() - goal_t0, 1))
                            send_event(goal['session_id'], 'near', goal['stop'], distance)
                if result is None:
                    continue
                if result is False and attempts < MAX_ATTEMPTS:
                    attempts += 1
                    log.warning(f'Nav2 did not reach the goal; trying again ({attempts}/{MAX_ATTEMPTS})')
                    goal_log('nav_goal_failed', 'warn', goal, attempt=attempts - 1, retrying=True, pose=pose_dict(pose),
                             after_s=round(time.time() - goal_t0, 1))
                    self.driver.go(goal['x'], goal['y'], goal['yaw'])
                    goal_log('nav_goal_sent', 'info', goal, attempt=attempts, retry=True,
                             accepted=getattr(self.driver, '_accepted', True), pose=pose_dict(pose))
                    continue
                self.goal = None
                distance = None if not pose else math.hypot(goal['x'] - pose[0], goal['y'] - pose[1])
                # Nav2 gave up: robot failures are out of scope, so the visit goes on. Within REACHED_M of the
                # stop that is as good as there; farther away the event says reached=false, and n8n tells the
                # customer where the item is (aisle, bay, lit tag) instead of "you have arrived".
                reached = bool(result) or (distance is not None and distance <= REACHED_M)
                if result is False:
                    log.error(f'Nav2 gave up on this goal ({"" if distance is None else f"{distance:.1f} m away, "}'
                              f'{"close enough" if reached else "NOT at the stop"}); the visit goes on')
                    goal_log('nav_goal_gave_up', 'error', goal, attempts=attempts, pose=pose_dict(pose),
                             distance_m=None if distance is None else round(distance, 2), reached=reached,
                             after_s=round(time.time() - goal_t0, 1),
                             note='reported as reached (within %.0f m)' % REACHED_M if reached else
                             'reported with reached=false: the phone shows where the item is, the light is turned on')
                else:
                    goal_log('nav_goal_succeeded', 'info', goal, attempts=attempts, pose=pose_dict(pose),
                             distance_m=None if distance is None else round(distance, 2),
                             after_s=round(time.time() - goal_t0, 1))
                with self.lock:
                    if self.command is not None:           # a newer order arrived meanwhile
                        goal_log('arrival_superseded', 'info', goal, note='a newer order arrived meanwhile; no event sent')
                        continue
                    self._set_state('waiting_for_pick' if goal['kind'] == 'item' else 'done',
                                    'nav2 goal reached' if result else 'nav2 gave up', session_id=goal['session_id'])
                if goal['kind'] == 'item':
                    goal_log('arrived', 'info' if reached else 'error', goal,
                             distance_m=None if distance is None else round(distance, 2), pose=pose_dict(pose),
                             tag_code=goal['stop']['tag_code'], near_sent=goal.get('near_sent'), reached=reached)
                    send_event(goal['session_id'], 'arrived', goal['stop'], distance, reached=reached)
                else:
                    goal_log('home', 'info' if reached else 'error', goal, pose=pose_dict(pose), reached=reached,
                             distance_m=None if distance is None else round(distance, 2))
                    send_event(goal['session_id'], 'home', reached=reached)
            except Exception as error:
                log.exception('worker error')
                jlog('worker_error', 'error', self.session_id, error=repr(error), trace=traceback.format_exc()[-2000:])


_events = queue.Queue()


def send_event(session_id, event, stop=None, distance=None, reached=None):
    """Tell n8n that something happened. Events go out one at a time, in the order they happened (one sender
    thread), so n8n has finished with "near" before "arrived" reaches it, even when both happen in the same second."""
    body = {'session_id': session_id, 'event': event}
    if stop:
        body.update(sku=stop['sku'], tag_code=stop['tag_code'])
    if distance is not None:
        body['distance_m'] = round(distance, 2)
    if reached is not None:
        body['reached'] = bool(reached)
    _events.put((body, time.time()))
    if _events.qsize() > 3:
        jlog('event_queue_backlog', 'warn', session_id, waiting=_events.qsize(), note='n8n answers robot events slowly')


def event_sender():
    """The one thread that delivers robot events to n8n, oldest first."""
    while True:
        body, queued_at = _events.get()
        try:
            post_event(body, queued_at)
        except Exception as error:
            jlog('worker_error', 'error', body.get('session_id'), where='event_sender', error=repr(error))


def post_event(body, queued_at):
    """POST one event to n8n, with a few retries (n8n answers once it has saved the visit)."""
    session_id, event = body['session_id'], body['event']
    t0, problems, status, problem = time.time(), [], None, None
    for attempt in range(3):
        try:
            reply = requests.post(N8N_EVENT_URL, json=body, timeout=15)
            status = reply.status_code
            if reply.ok:
                log.info(f'[{session_id}] told n8n: {event}' + (f' ({body["distance_m"]} m)' if 'distance_m' in body else ''))
                jlog('event_sent', 'warn' if problems else 'info', session_id, duration_ms=(time.time() - t0) * 1000,
                     robot_event=event, sku=body.get('sku'), tag_code=body.get('tag_code'),
                     distance_m=body.get('distance_m'), reached=body.get('reached'), ok=True, http_status=status,
                     attempts=attempt + 1, queued_ms=int((t0 - queued_at) * 1000),
                     reply=reply.text[:200], earlier_problems=problems or None)
                return
            problem = f'HTTP {reply.status_code} {reply.text[:120]}'
        except requests.RequestException as error:
            problem = str(error)[:300]
        problems.append(problem)
        time.sleep(1.0)
    log.warning(f'[{session_id}] could not tell n8n "{event}" at {N8N_EVENT_URL}: {problem} '
                '(is n8n running and the workflow active?)')
    jlog('event_sent', 'error', session_id, duration_ms=(time.time() - t0) * 1000, robot_event=event, sku=body.get('sku'),
         tag_code=body.get('tag_code'), distance_m=body.get('distance_m'), reached=body.get('reached'), ok=False,
         http_status=status, attempts=3, problems=problems, url=N8N_EVENT_URL)


# =========================================================================
# The HTTP endpoints (formats: API_CONTRACT.md, part B)
# =========================================================================
class Stop(BaseModel):
    sku: str
    name: str
    aisle: int
    shelf: int
    x: float
    y: float
    yaw: float
    tag_code: str
    light_x: float
    light_y: float
    light_z: float = layout.LIGHT_HEIGHT


class TourStart(BaseModel):
    session_id: str
    index: int = 1
    total: int = 1
    stop: Stop


class TourNext(BaseModel):
    session_id: Optional[str] = None


class TourDone(BaseModel):
    session_id: Optional[str] = None
    reason: str = 'done'


class Tag(BaseModel):
    tag_code: str
    x: Optional[float] = None      # optional: lets a tag be lit that was never part of a tour (testing)
    y: Optional[float] = None
    z: Optional[float] = None


driver = MockDriver() if MODE == 'mock' else RosDriver()
tour = Tour(driver)


@asynccontextmanager
async def lifespan(app):
    _jsonl_open()
    jlog('service_start', mode=driver.name, port=PORT, n8n_event_url=N8N_EVENT_URL, near_m=NEAR_M, log_file=JSONL)
    driver.start()
    threading.Thread(target=tour.run, daemon=True).start()
    threading.Thread(target=event_sender, daemon=True).start()
    log.info(f'Robot service on port {PORT}, mode {driver.name}; robot events go to {N8N_EVENT_URL}')
    yield


app = FastAPI(title='Home Depot guide robot service', lifespan=lifespan)

# Live mirror of the customer's phone on the demo stage (display relay only, no decisions)
from mirror import router as mirror_router  # noqa: E402
app.include_router(mirror_router)


def log_order(request, body, started, session_id=None, **details):
    """One structured log line per order from n8n: what was asked, and the state it left the robot in."""
    try:
        status = tour.status()
        item = status.get('current_item') or {}
        jlog('http', 'info', session_id or status.get('session_id'), duration_ms=(time.time() - started) * 1000,
             method=request.method, path=request.url.path, http_status=200, body=body,
             n8n_execution=request.headers.get('x-hd-execution'), n8n_order=request.headers.get('x-hd-order'),
             result={'state': status['state'], 'session_id': status['session_id'], 'index': status['index'],
                     'total': status['total'], 'sku': item.get('sku'), 'lights_on': status['lights_on'],
                     'pose': status['pose'], 'distance_m': status['distance_m']}, **details)
    except Exception:
        pass


@app.exception_handler(RequestValidationError)
async def bad_request(request: Request, error: RequestValidationError):
    """A body that does not fit API_CONTRACT.md: logged, then FastAPI's usual 422 reply."""
    session = error.body.get('session_id') if isinstance(error.body, dict) else None
    jlog('http', 'error', session, method=request.method, path=request.url.path, http_status=422,
         errors=jsonable_encoder(error.errors())[:5], body=str(error.body)[:500],
         n8n_execution=request.headers.get('x-hd-execution'), n8n_order=request.headers.get('x-hd-order'))
    return await request_validation_exception_handler(request, error)


@app.get('/health')
def health():
    return {'ok': True, 'mode': driver.name, 'nav2_ready': driver.ready()}


@app.post('/tour/start')
def tour_start(body: TourStart, request: Request):
    started = time.time()
    tour.start(body.session_id, body.index, body.total, body.stop.model_dump())
    log_order(request, {'session_id': body.session_id, 'index': body.index, 'total': body.total,
                        'stop': summary(body.stop.model_dump())}, started, body.session_id)
    return tour.status()


@app.post('/tour/next')
def tour_next(request: Request, body: TourNext = TourNext()):
    started = time.time()
    tour.picked(body.session_id)
    log_order(request, {'session_id': body.session_id}, started, body.session_id)
    return tour.status()


@app.get('/tour/status')
def tour_status():
    return tour.status()


@app.post('/tour/done')
def tour_done(request: Request, body: TourDone = TourDone()):
    started = time.time()
    tour.go_home(body.session_id, body.reason)
    log_order(request, {'session_id': body.session_id, 'reason': body.reason}, started, body.session_id)
    return tour.status()


def tag_position(body):
    return None if body.x is None or body.y is None else {'x': body.x, 'y': body.y, 'z': body.z or layout.LIGHT_HEIGHT}


@app.post('/tag/on')
def tag_on(body: Tag, request: Request):
    started = time.time()
    known = tour.light(body.tag_code, True, tag_position(body))
    log_order(request, body.model_dump(exclude_none=True), started, drawn=known)
    return {'ok': True, 'tag_code': body.tag_code, 'light': 'on'}


@app.post('/tag/off')
def tag_off(body: Tag, request: Request):
    started = time.time()
    known = tour.light(body.tag_code, False, tag_position(body))
    log_order(request, body.model_dump(exclude_none=True), started, drawn=known)
    return {'ok': True, 'tag_code': body.tag_code, 'light': 'off'}


# -------------------------------------------------------------------------
# Logs: GET /logs reads the structured log; POST /log is how the demo pages add to it
# -------------------------------------------------------------------------
@app.get('/logs')
def get_logs(since: Optional[str] = None, session_id: Optional[str] = None, level: Optional[str] = None,
             limit: int = 500):
    """Recent structured log entries, oldest first. since = a line number (entries after it) or an ISO time;
    level = info | warn | error (that level and worse). The reply's last_line is the "since" for the next call."""
    entries, last = read_jsonl(since, session_id, limit, level)
    return {'entries': entries, 'last_line': last, 'file': JSONL}


PAGE_SOURCES = ('phone', 'stage', 'tool', 'page')


@app.post('/log')
async def page_log(request: Request):
    """One entry from a demo page (or a tool): {source, level, session_id, event, details}. Never fails."""
    try:
        raw = await request.body()
        entry = json.loads(raw[:20000] or b'{}')
        if not isinstance(entry, dict):
            raise ValueError('not an object')
    except Exception as error:
        jlog('page_log_unreadable', 'warn', None, source='page', error=str(error)[:200])
        return {'ok': False}
    details = entry.get('details') if isinstance(entry.get('details'), dict) else {'value': entry.get('details')}
    text = json.dumps(details, default=str)
    if len(text) > 8000:
        details = {'truncated': text[:8000]}
    source = entry.get('source') if entry.get('source') in PAGE_SOURCES else 'page'
    level = entry.get('level') if entry.get('level') in ('info', 'warn', 'error') else 'info'
    session = entry.get('session_id')
    duration = entry.get('duration_ms') if isinstance(entry.get('duration_ms'), (int, float)) else None
    jlog(str(entry.get('event') or 'unknown')[:60], level, str(session)[:40] if session else None, source=source,
         duration_ms=duration, details_dict=details)
    return {'ok': True}


# -------------------------------------------------------------------------
# The demo screens (kiosk, phone, live store map) are served from here too, so
# one address shows everything: http://localhost:8000/demo/
# -------------------------------------------------------------------------
@app.get('/store/layout')
def store_layout():
    """The store's floor plan, for drawing the live map."""
    return {
        'width': layout.WIDTH, 'depth': layout.DEPTH,
        'racks': layout.rack_boxes(),
        'obstacles': [{'x0': a, 'y0': b, 'x1': c, 'y1': d, 'label': label} for a, b, c, d, label in layout.FRONT_OBSTACLES],
        'aisles': [{'number': n, 'x': layout.aisle_x(n), 'name': layout.DEPARTMENTS[n]} for n in layout.DEPARTMENTS],
        'rack_y': [layout.FRONT_Y0, layout.FRONT_Y1, layout.BACK_Y0, layout.BACK_Y1],
        'dock': {'x': layout.DOCK[0], 'y': layout.DOCK[1]}, 'entrance': layout.ENTRANCE, 'near_m': NEAR_M,
    }


@app.api_route('/webhook/{path:path}', methods=['GET', 'POST'])
async def n8n_proxy(path: str, request: Request):
    """Passes the demo pages' calls on to n8n, so the pages need only this one address."""
    body = await request.body()
    started = time.time()

    def forward():
        return requests.request(request.method, f'{N8N_URL}/webhook/{path}', params=dict(request.query_params),
                                data=body or None, headers={'Content-Type': 'application/json'}, timeout=180)
    try:
        reply = await run_in_threadpool(forward)
    except requests.RequestException as error:
        proxy_log(path, request, body, started, 502, None, str(error))
        return Response(content='{"error": "n8n_unreachable", "message": "%s"}' % str(error)[:120].replace('"', "'"),
                        status_code=502, media_type='application/json')
    proxy_log(path, request, body, started, reply.status_code, reply.content)
    return Response(content=reply.content, status_code=reply.status_code, media_type='application/json')


def proxy_log(path, request, body, started, status, content, error=None):
    """One line per page call to n8n, except the every-second status polls that went fine."""
    try:
        if path == 'help/status' and status == 200:
            return
        try:
            sent = json.loads(body) if body else {}
        except ValueError:
            sent = {'unreadable_body_bytes': len(body)}
        if not isinstance(sent, dict):
            sent = {'value': sent}
        brief = {k: (v if k != 'text' else str(v)[:200]) for k, v in sent.items() if not k.endswith('_base64')}
        brief.update({k + '_kb': round(len(str(v)) * 0.75 / 1024) for k, v in sent.items() if k.endswith('_base64') and v})
        try:
            got = json.loads(content) if content else {}
        except ValueError:
            got = {'unreadable_reply': content[:200].decode('utf-8', 'replace')}
        if not isinstance(got, dict):
            got = {}
        session = sent.get('session_id') or request.query_params.get('session_id') or got.get('session_id')
        level = 'error' if status >= 500 or error else 'warn' if status >= 400 or got.get('error') else 'info'
        jlog('proxy', level, session, duration_ms=(time.time() - started) * 1000, method=request.method,
             path='/webhook/' + path, http_status=status, sent=brief, reply_screen=got.get('screen'),
             reply_error=got.get('error'), reply_message=str(got.get('message'))[:200] if got.get('error') or status >= 400 else None,
             error=error)
    except Exception:
        pass


if os.path.isdir(DEMO_DIR):
    app.mount('/demo', StaticFiles(directory=DEMO_DIR, html=True), name='demo')


if __name__ == '__main__':
    uvicorn.run(app, host='0.0.0.0', port=PORT, log_level='warning')
