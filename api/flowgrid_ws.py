"""
flowgrid_ws.py

Simple WebSocket broadcaster using the `websockets` library.

Usage:
  b = WebSocketBroadcaster(host='127.0.0.1', port=6789)
  b.start()
  b.broadcast({'hello': 'world'})
  b.stop()

This runs an asyncio WebSocket server in a background thread and maintains
a set of connected clients. Broadcasting is thread-safe.
"""
import asyncio
import threading
import json
import logging
from typing import Set

try:
    import websockets
except Exception:
    websockets = None

logger = logging.getLogger('flowgrid.ws')
logger.setLevel(logging.DEBUG)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter('[%(asctime)s] %(levelname)s %(message)s'))
logger.addHandler(handler)


class WebSocketBroadcaster:
    def __init__(self, host='127.0.0.1', port=6789):
        if websockets is None:
            raise RuntimeError('websockets package is required. Install with: pip install websockets')
        self.host = host
        self.port = port
        self._clients: Set[websockets.server.WebSocketServerProtocol] = set()
        self._lock = threading.Lock()
        self._loop = None
        self._server = None
        self._thread = None

    def start(self):
        # Start asyncio loop in background thread
        self._thread = threading.Thread(target=self._run_loop, daemon=True, name='ws-broadcaster')
        self._thread.start()
        logger.debug('WebSocketBroadcaster started on %s:%s', self.host, self.port)

    def stop(self):
        if self._loop:
            try:
                if self._loop.is_running():
                    asyncio.run_coroutine_threadsafe(self._shutdown(), self._loop).result(timeout=5)
            except Exception:
                logger.exception('Graceful shutdown failed; forcing loop stop')
                try:
                    # force stop the loop if shutdown hangs
                    self._loop.call_soon_threadsafe(self._loop.stop)
                except Exception:
                    logger.exception('Failed to stop event loop')
        if self._thread:
            self._thread.join(timeout=3)

    async def _shutdown(self):
        logger.debug('Shutting down WebSocket server...')
        if self._server:
            self._server.close()
            await self._server.wait_closed()
        # close clients
        with self._lock:
            clients = list(self._clients)
        for c in clients:
            try:
                await c.close()
            except Exception:
                pass

    def _run_loop(self):
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        coro = websockets.serve(self._handler, self.host, self.port)
        self._server = self._loop.run_until_complete(coro)
        try:
            self._loop.run_forever()
        finally:
            self._loop.run_until_complete(self._shutdown())
            self._loop.close()

    async def _handler(self, websocket, path):
        logger.debug('Client connected: %s', websocket.remote_address)
        with self._lock:
            self._clients.add(websocket)
        try:
            # Echo server: we don't expect clients to send, but keep the connection open
            async for _ in websocket:
                pass
        except Exception:
            logger.debug('Client handler exception')
        finally:
            with self._lock:
                self._clients.discard(websocket)
            logger.debug('Client disconnected: %s', websocket.remote_address)

    def broadcast(self, obj):
        try:
            data = json.dumps(obj, default=str)
        except Exception:
            logger.exception('Failed to json-serialize broadcast object')
            return
        # schedule send on event loop
        if not (self._loop and self._loop.is_running()):
            return
        asyncio.run_coroutine_threadsafe(self._broadcast_coro(data), self._loop)

    async def _broadcast_coro(self, data: str):
        with self._lock:
            clients = list(self._clients)
        if not clients:
            return
        to_remove = []
        for c in clients:
            try:
                await c.send(data)
            except Exception:
                to_remove.append(c)
        if to_remove:
            with self._lock:
                for r in to_remove:
                    self._clients.discard(r)


if __name__ == '__main__':
    b = WebSocketBroadcaster()
    b.start()
    import time
    try:
        i = 0
        while True:
            b.broadcast({'tick': i})
            i += 1
            time.sleep(1)
    except KeyboardInterrupt:
        b.stop()
