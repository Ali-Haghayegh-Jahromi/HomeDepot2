# The robot side of the demo: ROS 2 Humble + Nav2 + RViz (from the existing
# Dingo workstation image) plus the few Python packages the robot service needs.
FROM dingo-pc-humble
RUN apt-get update && apt-get install -y --no-install-recommends python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --no-cache-dir "fastapi==0.115.*" "uvicorn==0.32.*" "requests==2.32.*"
WORKDIR /hd
