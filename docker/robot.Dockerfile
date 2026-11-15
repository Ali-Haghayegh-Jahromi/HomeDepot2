# syntax=docker/dockerfile:1
# The robot side of the demo in one self-contained image, for x86_64 and arm64
# (Ubuntu PCs, Intel and Apple Silicon Macs):
#   simulated robot + store, Nav2, RViz (shown in the browser through noVNC),
#   the robot service (FastAPI on :8000, also serves the demo pages at /demo),
#   optional https for phones on :8443 (HD_HTTPS=yes).
# Built by docker/compose.yaml (context: the repo folder).

# Official multi-arch images, pinned. To update: docker buildx imagetools inspect <tag>
ARG ROS_IMAGE=ros:humble-ros-base-jammy@sha256:d9f14e84747bea639a65e00cf871d2c68ae55385d2acf6239614de0cadb41dcc
ARG NODE_IMAGE=node:22.23.5-bookworm-slim

# ---------------------------------------------------------------- front end
# auto: build ui/ (React + Vite) when it has a package.json, else use demo/ as it is
# ui:   build ui/ (fail if it cannot)       demo: always use demo/
FROM ${NODE_IMAGE} AS frontend
ARG HD_FRONTEND=auto
WORKDIR /src
COPY demo/ demo/
COPY ui/ ui/
RUN --mount=type=cache,target=/root/.npm \
    set -e; \
    if [ "$HD_FRONTEND" != demo ] && [ -f ui/package.json ]; then \
      echo "front end: building ui/"; \
      cd ui && npm ci --no-audit --no-fund && npm run build && mv dist /out; \
    elif [ "$HD_FRONTEND" = ui ]; then \
      echo "HD_FRONTEND=ui but ui/package.json is missing" >&2; exit 1; \
    else \
      echo "front end: demo/ (no build step)"; mv demo /out; \
    fi

# ---------------------------------------------------------------- robot
FROM ${ROS_IMAGE}
ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8 LC_ALL=C.UTF-8 \
    PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
# Nav2 + RViz; Xvfb (a screen in memory) + x11vnc + noVNC to show RViz in a browser
# tab, with Mesa software rendering (no GPU needed); xdotool switches RViz to full screen;
# openssl makes the self-signed certificate for HD_HTTPS; psql for tools/log_check.py.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ros-humble-navigation2 ros-humble-nav2-bringup ros-humble-robot-state-publisher ros-humble-rviz2 \
      python3-pip python3-numpy python3-yaml curl postgresql-client openssl \
      xvfb x11vnc novnc python3-websockify libgl1-mesa-dri fonts-dejavu-core xdotool \
    && rm -rf /var/lib/apt/lists/*
RUN pip3 install --no-cache-dir "fastapi==0.115.*" "uvicorn==0.32.*" "requests==2.32.*"

# The demo itself (the source folders are copied in; docker/compose.dev.yaml mounts them instead)
COPY store/ /hd/store/
COPY robot/sim/ /hd/robot/sim/
COPY robot/robot_service/ /hd/robot/robot_service/
COPY tools/ /hd/tools/
COPY n8n/test/fake_gemini.py /hd/n8n/test/fake_gemini.py
# the built front end, at both places service.py may serve /demo from (demo/ now, ui/dist/ later)
COPY --from=frontend /out/ /hd/demo/
COPY --from=frontend /out/ /hd/ui/dist/
COPY docker/robot/ /opt/hd/
RUN chmod +x /opt/hd/entrypoint.sh \
    && cp /opt/hd/novnc-index.html /usr/share/novnc/index.html \
    && mkdir -p /opt/hd/rviz-off && cp /opt/hd/rviz-off.html /opt/hd/rviz-off/index.html \
    && mkdir -p /hd/logs /hd/tls
WORKDIR /hd
EXPOSE 8000 6080 8443
ENTRYPOINT ["/opt/hd/entrypoint.sh"]
