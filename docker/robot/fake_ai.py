"""Runs the stand-in AI (n8n/test/fake_gemini.py) so other containers can reach it.

fake_gemini.py listens on 127.0.0.1:8010, which inside a container is reachable from that
container only; this wrapper makes it listen on all of the container's addresses instead
(compose service "fake-ai", profile "offline"; n8n calls http://fake-ai:8010).
"""
import http.server
import runpy

Base = http.server.ThreadingHTTPServer


class AllAddresses(Base):
    def __init__(self, address, handler, *args, **kwargs):
        super().__init__(('0.0.0.0', address[1]), handler, *args, **kwargs)


http.server.ThreadingHTTPServer = AllAddresses
runpy.run_path('/hd/n8n/test/fake_gemini.py', run_name='__main__')
