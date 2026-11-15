#!/usr/bin/env python3
"""HTTPS for the demo pages on a real phone (HD_HTTPS=yes).

Browsers allow the microphone (the phone's voice notes) only on https or localhost. This passes
https://<this computer>:8443/... on to the robot service on http://127.0.0.1:8000, byte for byte
(so Server-Sent Events stream through as they are), with a self-signed certificate made on the
first start (openssl, in the container; nothing is installed on the computer).

    tls_proxy.py --cert /hd/tls/cert.pem --key /hd/tls/key.pem --listen 8443 --to 8000
"""
import argparse
import asyncio
import ssl


async def pipe(reader, writer):
    try:
        while True:
            data = await reader.read(65536)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    except (ConnectionError, asyncio.IncompleteReadError, ssl.SSLError, OSError):
        pass
    finally:
        try:
            writer.close()
        except Exception:
            pass


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cert', required=True)
    ap.add_argument('--key', required=True)
    ap.add_argument('--listen', type=int, default=8443)
    ap.add_argument('--to', type=int, default=8000)
    args = ap.parse_args()
    # a phone that has not accepted the certificate yet just closes the connection: not an error
    asyncio.get_running_loop().set_exception_handler(lambda loop, context: None)

    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    ctx.load_cert_chain(args.cert, args.key)
    ctx.set_alpn_protocols(['http/1.1'])

    async def handle(client_r, client_w):
        try:
            up_r, up_w = await asyncio.open_connection('127.0.0.1', args.to)
        except OSError:
            client_w.close()
            return
        await asyncio.gather(pipe(client_r, up_w), pipe(up_r, client_w))

    server = await asyncio.start_server(handle, '0.0.0.0', args.listen, ssl=ctx, ssl_handshake_timeout=15)
    print(f'HTTPS on port {args.listen} -> http://127.0.0.1:{args.to}', flush=True)
    async with server:
        await server.serve_forever()


if __name__ == '__main__':
    asyncio.run(main())
