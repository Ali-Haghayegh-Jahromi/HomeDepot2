# The whole robot simulation in one launch: simulated robot + store, robot
# model, AMCL localization + Nav2 on the store map, and RViz.
#   ros2 launch /hd/robot/sim/sim.launch.py            (rviz:=false for no window)
import math
import os
import sys

import yaml
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, ExecuteProcess, IncludeLaunchDescription
from launch.conditions import IfCondition
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node

HERE = os.path.dirname(os.path.abspath(__file__))
STORE = os.path.join(HERE, '..', '..', 'store')
sys.path.insert(0, STORE)
import layout as L  # noqa: E402

MAX_SPEED, MAX_TURN = 1.0, 1.8      # m/s (a slow walking pace), rad/s


def nav2_params():
    """Nav2's stock parameters, changed for this robot and store; returns the file."""
    with open(os.path.join(get_package_share_directory('nav2_bringup'), 'params', 'nav2_params.yaml')) as f:
        p = yaml.safe_load(f)

    amcl = p['amcl']['ros__parameters']
    # Localization starts on the dock, so nobody has to click a start pose
    amcl.update(set_initial_pose=True, initial_pose={'x': L.HOME['x'], 'y': L.HOME['y'], 'z': 0.0, 'yaw': L.HOME['yaw']},
                alpha1=0.05, alpha2=0.05, alpha3=0.05, alpha4=0.05, laser_max_range=12.0, max_beams=120,
                update_min_d=0.1, update_min_a=0.1)

    controller = p['controller_server']['ros__parameters']
    controller['progress_checker'].update(required_movement_radius=0.3, movement_time_allowance=15.0)
    controller['general_goal_checker'].update(xy_goal_tolerance=0.15, yaw_goal_tolerance=0.08)
    # Regulated Pure Pursuit: smooth at walking pace, slows down in tight spots and
    # near the goal, turns on the spot to face the shelf
    controller['FollowPath'] = {
        'plugin': 'nav2_regulated_pure_pursuit_controller::RegulatedPurePursuitController',
        'desired_linear_vel': MAX_SPEED, 'lookahead_dist': 0.8, 'min_lookahead_dist': 0.45, 'max_lookahead_dist': 1.2,
        'lookahead_time': 1.2, 'use_velocity_scaled_lookahead_dist': True, 'rotate_to_heading_angular_vel': MAX_TURN * 0.7,
        'transform_tolerance': 0.2, 'min_approach_linear_velocity': 0.08, 'approach_velocity_scaling_dist': 1.0,
        'use_collision_detection': True, 'max_allowed_time_to_collision_up_to_carrot': 1.0,
        'use_regulated_linear_velocity_scaling': True, 'use_cost_regulated_linear_velocity_scaling': True,
        'regulated_linear_scaling_min_radius': 0.9, 'regulated_linear_scaling_min_speed': 0.3,
        'use_rotate_to_heading': True, 'rotate_to_heading_min_angle': 0.6, 'max_angular_accel': 3.2,
        'allow_reversing': False, 'max_robot_pose_search_dist': 10.0,
    }

    smoother = p['velocity_smoother']['ros__parameters']
    smoother.update(max_velocity=[MAX_SPEED, 0.0, MAX_TURN], min_velocity=[-MAX_SPEED, 0.0, -MAX_TURN],
                    max_accel=[1.2, 0.0, 3.2], max_decel=[-2.0, 0.0, -3.2])
    p['behavior_server']['ros__parameters'].update(max_rotational_vel=MAX_TURN, min_rotational_vel=0.4)

    local = p['local_costmap']['local_costmap']['ros__parameters']
    local.update(width=6, height=6, robot_radius=L.ROBOT_RADIUS)
    local['inflation_layer'].update(inflation_radius=0.7, cost_scaling_factor=4.0)
    local['voxel_layer']['scan'].update(raytrace_max_range=6.0, obstacle_max_range=5.5)
    world = p['global_costmap']['global_costmap']['ros__parameters']
    world.update(robot_radius=L.ROBOT_RADIUS, track_unknown_space=False)
    world['inflation_layer'].update(inflation_radius=0.9, cost_scaling_factor=3.0)   # keeps routes mid-aisle
    world['obstacle_layer']['scan'].update(raytrace_max_range=6.0, obstacle_max_range=5.5)
    p['planner_server']['ros__parameters'].update(expected_planner_frequency=5.0)
    p['planner_server']['ros__parameters']['GridBased'].update(tolerance=0.3, allow_unknown=False)

    path = '/tmp/hd_nav2_params.yaml'
    with open(path, 'w') as f:
        yaml.safe_dump(p, f, sort_keys=False)
    return path


def generate_launch_description():
    with open(os.path.join(HERE, 'robot.urdf')) as f:
        urdf = f.read()
    return LaunchDescription([
        DeclareLaunchArgument('rviz', default_value='true', choices=['true', 'false']),
        ExecuteProcess(cmd=['python3', '-u', os.path.join(HERE, 'sim_robot.py')], output='screen'),
        Node(package='robot_state_publisher', executable='robot_state_publisher', output='log',
             parameters=[{'robot_description': urdf}]),
        IncludeLaunchDescription(
            PythonLaunchDescriptionSource(os.path.join(
                get_package_share_directory('nav2_bringup'), 'launch', 'bringup_launch.py')),
            launch_arguments=[('map', os.path.join(STORE, 'map', 'store.yaml')), ('use_sim_time', 'false'),
                              ('params_file', nav2_params()), ('autostart', 'true'), ('use_composition', 'False')]),
        Node(package='rviz2', executable='rviz2', output='log', condition=IfCondition(LaunchConfiguration('rviz')),
             arguments=['-d', os.path.join(HERE, 'store.rviz')]),
    ])
