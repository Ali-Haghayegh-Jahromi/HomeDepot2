#!/usr/bin/env python3
"""The simulated guide robot and the simulated store.

Stands in for Gazebo: a robot that obeys velocity commands (cmd_vel), reports
its wheel odometry and TF, and "sees" the store with a 360 degree laser scanner
computed from the store map. Nav2 (AMCL, planner, controller) runs on top of it
exactly as it would on a real robot.

It also draws the store in RViz in 3D (racks, registers, kiosk, dock, aisle
signs) on /store/markers.
"""
import math
import os
import sys

import numpy as np
import rclpy
from geometry_msgs.msg import TransformStamped, Twist
from nav_msgs.msg import Odometry
from rclpy.executors import ExternalShutdownException
from rclpy.node import Node
from rclpy.qos import DurabilityPolicy, QoSProfile, qos_profile_sensor_data
from sensor_msgs.msg import LaserScan
from tf2_ros import TransformBroadcaster
from visualization_msgs.msg import Marker, MarkerArray

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'store'))
import layout as L  # noqa: E402

MAP_PGM = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'store', 'map', 'store.pgm')
STEP_HZ, SCAN_HZ = 50.0, 10.0
BEAMS, RANGE_MAX, RANGE_STEP = 360, 12.0, 0.025
CMD_TIMEOUT_S = 0.5
MAX_SPEED, MAX_TURN = 1.5, 2.5          # what the motors can do (Nav2 asks for less)
ORANGE = (0.976, 0.388, 0.008)          # Home Depot orange
# The web UI's theme (ui/themes/aisle), so RViz and the stage look like one product
ACCENT = (0.780, 0.306, 0.0)            # --color-accent  #c74e00
INK = (0.04, 0.07, 0.09)                # --color-text-primary (dark)
PAPER = (1.0, 1.0, 1.0)                 # --color-background-surface
SUCCESS = (0.082, 0.502, 0.239)         # --color-success #15803d (the robot and its light)
SUCCESS_MUTED = (0.702, 0.890, 0.733)   # --color-success-muted #b3e3bb
# HD_RVIZ_VIEW=top (the default, for recording): signs and labels drawn to be read from above
TOP_VIEW = os.environ.get('HD_RVIZ_VIEW', 'top').lower() != '3d'
# Department names on the top view, in two short lines that fit between two aisle signs
SHORT_NAMES = {1: 'Lumber\nDecking', 2: 'Building\nMaterials', 3: 'Fasteners', 4: 'Hand\nTools', 5: 'Power\nTools',
               6: 'Cabinet\nHardware', 7: 'Electrical', 8: 'Lighting', 9: 'Plumbing', 10: 'Kitchen\nBath',
               11: 'Paint', 12: 'Paint\nSupplies'}


def load_map():
    """The store map as a grid of True (wall/rack) and False (free); row 0 = y 0."""
    with open(MAP_PGM, 'rb') as f:
        assert f.readline().strip() == b'P5'
        width, height = map(int, f.readline().split())
        f.readline()
        cells = np.frombuffer(f.read(), dtype=np.uint8).reshape(height, width)
    return cells[::-1] < 128


class SimRobot(Node):
    def __init__(self):
        super().__init__('sim_robot')
        self.occupied = load_map()
        self.x, self.y, self.yaw = L.HOME['x'], L.HOME['y'], L.HOME['yaw']
        self.v = self.w = 0.0
        self.cmd = Twist()
        self.cmd_time = self.get_clock().now()
        self.last_step = self.get_clock().now()

        self.create_subscription(Twist, 'cmd_vel', self.on_cmd, 10)
        self.odom_pub = self.create_publisher(Odometry, 'odom', 10)
        self.scan_pub = self.create_publisher(LaserScan, 'scan', qos_profile_sensor_data)
        self.tf = TransformBroadcaster(self)
        latched = QoSProfile(depth=1, durability=DurabilityPolicy.TRANSIENT_LOCAL)
        self.store_pub = self.create_publisher(MarkerArray, 'store/markers', latched)
        self.store_pub.publish(self.store_markers())
        self.angles = np.linspace(-math.pi, math.pi, BEAMS, endpoint=False)
        self.ranges = np.arange(0.05, RANGE_MAX, RANGE_STEP)
        self.create_timer(1.0 / STEP_HZ, self.step)
        self.create_timer(1.0 / SCAN_HZ, self.scan)
        self.get_logger().info(f'Simulated robot on its dock at x {self.x:.2f} y {self.y:.2f}; '
                               f'store {L.WIDTH:.0f} x {L.DEPTH:.0f} m, {L.N_AISLES} aisles')

    # ---------------------------------------------------------------- motion
    def on_cmd(self, msg):
        self.cmd, self.cmd_time = msg, self.get_clock().now()

    def blocked(self, x, y):
        """True if the robot's body at (x, y) would touch a wall or rack."""
        for a in np.linspace(0, 2 * math.pi, 12, endpoint=False):
            col = int((x + L.ROBOT_RADIUS * math.cos(a)) / L.RESOLUTION)
            row = int((y + L.ROBOT_RADIUS * math.sin(a)) / L.RESOLUTION)
            if not (0 <= row < self.occupied.shape[0] and 0 <= col < self.occupied.shape[1]) \
                    or self.occupied[row, col]:
                return True
        return False

    def step(self):
        now = self.get_clock().now()
        dt = (now - self.last_step).nanoseconds * 1e-9
        self.last_step = now
        fresh = (now - self.cmd_time).nanoseconds * 1e-9 < CMD_TIMEOUT_S
        self.v = max(-MAX_SPEED, min(MAX_SPEED, self.cmd.linear.x)) if fresh else 0.0
        self.w = max(-MAX_TURN, min(MAX_TURN, self.cmd.angular.z)) if fresh else 0.0
        self.yaw = math.atan2(math.sin(self.yaw + self.w * dt), math.cos(self.yaw + self.w * dt))
        nx = self.x + self.v * math.cos(self.yaw) * dt
        ny = self.y + self.v * math.sin(self.yaw) * dt
        if self.blocked(nx, ny):
            self.v = 0.0                    # bumped into something: stay put
        else:
            self.x, self.y = nx, ny
        self.publish_pose(now)

    def publish_pose(self, now):
        # The odom frame coincides with the map frame: the wheels of a simulated
        # robot don't slip, so AMCL only has to confirm the pose.
        stamp = now.to_msg()
        qz, qw = math.sin(self.yaw / 2), math.cos(self.yaw / 2)
        t = TransformStamped()
        t.header.stamp, t.header.frame_id, t.child_frame_id = stamp, 'odom', 'base_footprint'
        t.transform.translation.x, t.transform.translation.y = self.x, self.y
        t.transform.rotation.z, t.transform.rotation.w = qz, qw
        self.tf.sendTransform(t)
        odom = Odometry()
        odom.header.stamp, odom.header.frame_id, odom.child_frame_id = stamp, 'odom', 'base_footprint'
        odom.pose.pose.position.x, odom.pose.pose.position.y = self.x, self.y
        odom.pose.pose.orientation.z, odom.pose.pose.orientation.w = qz, qw
        odom.twist.twist.linear.x, odom.twist.twist.angular.z = self.v, self.w
        self.odom_pub.publish(odom)

    # ------------------------------------------------------------------ scan
    def scan(self):
        now = self.get_clock().now()
        self.publish_pose(now)              # TF for exactly this scan's time
        world = self.angles + self.yaw
        xs = self.x + np.outer(np.cos(world), self.ranges)
        ys = self.y + np.outer(np.sin(world), self.ranges)
        cols = np.clip((xs / L.RESOLUTION).astype(int), 0, self.occupied.shape[1] - 1)
        rows = np.clip((ys / L.RESOLUTION).astype(int), 0, self.occupied.shape[0] - 1)
        hits = self.occupied[rows, cols]
        first = hits.argmax(axis=1)
        dist = np.where(hits.any(axis=1), self.ranges[first], np.inf)
        msg = LaserScan()
        msg.header.stamp, msg.header.frame_id = now.to_msg(), 'base_scan'
        msg.angle_min, msg.angle_max = -math.pi, math.pi - 2 * math.pi / BEAMS
        msg.angle_increment = 2 * math.pi / BEAMS
        msg.scan_time, msg.range_min, msg.range_max = 1.0 / SCAN_HZ, 0.05, RANGE_MAX
        msg.ranges = dist.astype(np.float32).tolist()
        self.scan_pub.publish(msg)

    # ----------------------------------------------------------- store in 3D
    def store_markers(self):
        markers, stamp = [], self.get_clock().now().to_msg()

        def add(kind, ns, x, y, z, sx, sy, sz, rgb, alpha=1.0, text=''):
            m = Marker()
            m.header.frame_id, m.header.stamp = 'map', stamp
            m.ns, m.id, m.type, m.action = ns, len(markers), kind, Marker.ADD
            m.pose.position.x, m.pose.position.y, m.pose.position.z = float(x), float(y), float(z)
            m.pose.orientation.w = 1.0
            m.scale.x, m.scale.y, m.scale.z = float(sx), float(sy), float(sz)
            m.color.r, m.color.g, m.color.b = rgb
            m.color.a, m.text = alpha, text
            markers.append(m)

        def box(ns, x0, y0, x1, y1, z0, z1, rgb, alpha=1.0):
            add(Marker.CUBE, ns, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, rgb, alpha)

        # Floor
        box('floor', 0, 0, L.WIDTH, L.DEPTH, -0.06, -0.01, (0.90, 0.90, 0.88) if TOP_VIEW else (0.80, 0.80, 0.78))
        # Racks: orange uprights and beams, with grey shelf levels full of "stock"
        for x0, y0, x1, y1 in L.rack_boxes():
            for level in (0.15, 1.0, 1.85, 2.7):
                box('rack_shelf', x0, y0, x1, y1, level, level + 0.08, ORANGE)
                box('rack_stock', x0 + 0.1, y0 + 0.1, x1 - 0.1, y1 - 0.1, level + 0.08, level + 0.6,
                    (0.62, 0.50, 0.36), 0.9)
            n = round((y1 - y0) / L.BAY_LENGTH)
            for i in range(n + 1):
                yy = y0 + i * (y1 - y0) / n
                for xx in (x0, x1 - 0.08):
                    box('rack_post', xx, yy - 0.04, xx + 0.08, yy + 0.04, 0.0, 3.6, ORANGE)
        if TOP_VIEW:
            self.top_view_signs(add, box)
        else:
            # Aisle signs
            for a in range(1, L.N_AISLES + 1):
                for y in (L.FRONT_Y0 - 0.6, L.BACK_Y1 + 0.6):
                    box('aisle_sign', L.aisle_x(a) - 1.1, y - 0.05, L.aisle_x(a) + 1.1, y + 0.05, 3.7, 4.7, ORANGE)
                    add(Marker.TEXT_VIEW_FACING, 'aisle_number', L.aisle_x(a), y, 5.3, 0, 0, 0.9, (1.0, 1.0, 1.0), 1.0,
                        str(a))
                    add(Marker.TEXT_VIEW_FACING, 'aisle_name', L.aisle_x(a), y, 4.2, 0, 0, 0.32, (1.0, 1.0, 1.0), 1.0,
                        L.DEPARTMENTS[a])
            # Front of the store
            for x0, y0, x1, y1, label in L.FRONT_OBSTACLES:
                if label == 'kiosk':
                    box('kiosk', x0, y0, x1, y1, 0.0, 1.1, (0.15, 0.15, 0.17))
                    box('kiosk', x0 + 0.05, y1 - 0.02, x1 - 0.05, y1 + 0.06, 1.1, 1.9, ORANGE)       # screen
                    add(Marker.TEXT_VIEW_FACING, 'label', (x0 + x1) / 2, (y0 + y1) / 2, 2.3, 0, 0, 0.35,
                        (1.0, 1.0, 1.0), 1.0, 'HELP KIOSK')
                else:
                    box('front', x0, y0, x1, y1, 0.0, 1.0, (0.35, 0.35, 0.38))
                    add(Marker.TEXT_VIEW_FACING, 'label', (x0 + x1) / 2, (y0 + y1) / 2, 1.5, 0, 0, 0.35,
                        (1.0, 1.0, 1.0), 1.0, label.upper())
            # The robot's dock beside the kiosk
            add(Marker.CYLINDER, 'dock', L.DOCK[0], L.DOCK[1], 0.01, 1.1, 1.1, 0.02, (0.10, 0.75, 0.25), 0.9)
            add(Marker.TEXT_VIEW_FACING, 'label', L.DOCK[0], L.DOCK[1] - 0.9, 0.4, 0, 0, 0.28, (0.10, 0.75, 0.25), 1.0,
                'ROBOT DOCK')
        # Outer walls, low and see-through so the camera can look in
        t = L.WALL
        for x0, y0, x1, y1 in ((0, 0, L.ENTRANCE[0], t), (L.ENTRANCE[1], 0, L.WIDTH, t), (0, L.DEPTH - t, L.WIDTH, L.DEPTH),
                               (0, 0, t, L.DEPTH), (L.WIDTH - t, 0, L.WIDTH, L.DEPTH)):
            box('wall', x0, y0, x1, y1, 0.0, 4.0, (0.55, 0.57, 0.60), 0.35)
        if not TOP_VIEW:
            add(Marker.TEXT_VIEW_FACING, 'label', sum(L.ENTRANCE) / 2, 0.6, 2.6, 0, 0, 0.5, (1.0, 1.0, 1.0), 1.0,
                'ENTRANCE')
        # The robot, big enough to find in a top view of the whole store: a green disc with a white
        # rim under the robot model, and a dark heading arrow in front of it (above the model), all
        # locked to the robot's own frame, so RViz moves them with TF.
        for kind, z, sx, sy, sz, rgb, x in ((Marker.CYLINDER, 0.05, 1.9, 1.9, 0.02, PAPER, 0.0),
                                            (Marker.CYLINDER, 0.065, 1.6, 1.6, 0.02, SUCCESS, 0.0),
                                            (Marker.ARROW, 1.9, 1.05, 0.32, 0.7, INK, 0.3)):
            m = Marker()
            m.header.frame_id = 'base_footprint'        # stamp 0: always the newest pose
            m.ns, m.id, m.type, m.action = 'robot_footprint', len(markers), kind, Marker.ADD
            m.frame_locked = True
            m.pose.position.x, m.pose.position.z = x, z
            m.pose.orientation.w = 1.0
            m.scale.x, m.scale.y, m.scale.z = sx, sy, sz
            m.color.r, m.color.g, m.color.b = rgb
            m.color.a = 1.0 if TOP_VIEW else 0.0
            markers.append(m)
        if not TOP_VIEW:
            markers = markers[:-3]
        return MarkerArray(markers=markers)

    def top_view_signs(self, add, box):
        """Store labels for the top view: dark aisle numbers on white signs, department names,
        the kiosk, the dock, the registers and the entrance, all large enough for a recording."""
        for a in range(1, L.N_AISLES + 1):
            x = L.aisle_x(a)
            for y in (L.FRONT_Y0 - 1.25, L.BACK_Y1 + 1.25):
                add(Marker.CYLINDER, 'aisle_sign', x, y, 4.60, 2.25, 2.25, 0.05, INK)          # dark rim
                add(Marker.CYLINDER, 'aisle_sign', x, y, 4.65, 1.95, 1.95, 0.05, PAPER)
                add(Marker.TEXT_VIEW_FACING, 'aisle_number', x, y, 4.9, 0, 0, 1.35, INK, 1.0, str(a))
            add(Marker.TEXT_VIEW_FACING, 'aisle_name', x, L.FRONT_Y0 - 3.4, 4.9, 0, 0, 0.72, INK, 1.0, SHORT_NAMES[a])
        for x0, y0, x1, y1, label in L.FRONT_OBSTACLES:
            if label == 'kiosk':
                box('kiosk', x0, y0, x1, y1, 0.0, 1.1, ACCENT)
                add(Marker.TEXT_VIEW_FACING, 'label', x0 - 1.9, (y0 + y1) / 2, 4.9, 0, 0, 0.62, ACCENT, 1.0, 'HELP\nKIOSK')
            else:
                box('front', x0, y0, x1, y1, 0.0, 1.0, (0.40, 0.42, 0.45))
                # one word per line: RViz draws spaces very wide
                name = label.split(' ')[-1] if label.startswith('register') else '\n'.join(label.upper().split(' ')[-2:])
                add(Marker.TEXT_VIEW_FACING, 'label', (x0 + x1) / 2, (y0 + y1) / 2, 4.9, 0, 0,
                    0.75 if label.startswith('register') else 0.55, PAPER, 1.0, name)
        regs = [o for o in L.FRONT_OBSTACLES if o[4].startswith('register')]
        add(Marker.TEXT_VIEW_FACING, 'label', (regs[0][0] + regs[-1][2]) / 2, 1.05, 4.9, 0, 0, 0.55, INK, 1.0,
            'REGISTERS')
        # the dock: a green pad with a dark ring; its label below it
        add(Marker.CYLINDER, 'dock', L.DOCK[0], L.DOCK[1], 0.01, 2.3, 2.3, 0.02, SUCCESS)
        add(Marker.CYLINDER, 'dock', L.DOCK[0], L.DOCK[1], 0.02, 2.0, 2.0, 0.02, SUCCESS_MUTED)
        add(Marker.TEXT_VIEW_FACING, 'label', L.DOCK[0] + 2.4, L.DOCK[1], 4.9, 0, 0, 0.62, SUCCESS, 1.0, 'ROBOT\nDOCK')
        add(Marker.TEXT_VIEW_FACING, 'label', sum(L.ENTRANCE) / 2, 0.75, 4.9, 0, 0, 0.62, INK, 1.0, 'ENTRANCE')


def main():
    rclpy.init()
    node = SimRobot()
    try:
        rclpy.spin(node)
    except (KeyboardInterrupt, ExternalShutdownException):
        pass


if __name__ == '__main__':
    main()
