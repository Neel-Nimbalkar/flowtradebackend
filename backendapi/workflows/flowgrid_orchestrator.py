"""
flowgrid_orchestrator.py

Orchestrates a graph of nodes and drives them from a PriceStream.
Ensures node errors do not break the whole workflow: node callbacks are wrapped
and logged. Uses a ThreadPool to execute downstream notifications to keep UI
and streaming non-blocking.
"""
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Any
import threading
import logging

from backendapi.workflows.flowgrid_realtime import PriceStream
from backendapi.workflows.flowgrid_nodes import Node
try:
    # optional broadcaster
    from backendapi.api.flowgrid_ws import WebSocketBroadcaster
except Exception:
    WebSocketBroadcaster = None

logger = logging.getLogger('flowgrid.orch')
logger.setLevel(logging.DEBUG)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter('[%(asctime)s] %(levelname)s %(message)s'))
logger.addHandler(handler)


class WorkflowRunner:
    """Simple orchestration for a set of nodes.

    - nodes: dict node_id->Node
    - edges: list of tuples (from_node_id, to_node_id)
    - stream: PriceStream instance
    """
    def __init__(self, nodes: Dict[str, Node], edges: list, stream: PriceStream = None):
        self.nodes = nodes
        self.edges = edges
        self.stream = stream or PriceStream(synthetic=True, poll_interval=1.0)
        self.broadcaster = None
        self._subs = {}  # sub_id -> (node_id, stream_sub_id)
        self._node_lock = threading.Lock()
        self._executor = ThreadPoolExecutor(max_workers=8)

        # build adjacency map
        self._adj: Dict[str, list] = {}
        for a, b in edges:
            self._adj.setdefault(a, []).append(b)

    def start(self):
        # subscribe nodes that need a symbol feed by convention (node.name may include symbol)
        self.stream.start()
        # if WebSocketBroadcaster is available, start it and subscribe to node emissions
        if WebSocketBroadcaster is not None:
            try:
                self.broadcaster = WebSocketBroadcaster()
                self.broadcaster.start()
                # subscribe to node emissions
                for nid, node in self.nodes.items():
                    # each node emits payload dicts; forward to websocket
                    node.subscribe('orch_bcast', lambda p, nid=nid: self._broadcast_node(nid, p))
            except Exception:
                logger.exception('Failed to start WebSocketBroadcaster')
        # for demo, subscribe all nodes to their symbol if node name contains ':' as 'NODE:SYM'
        for nid, node in self.nodes.items():
            parts = node.name.split(':')
            symbol = parts[1] if len(parts) > 1 else None
            if symbol:
                sub_id = self.stream.subscribe(symbol, lambda t, nid=nid: self._on_tick(nid, t))
                self._subs[nid] = (node, sub_id)
                logger.debug('Subscribed node %s to symbol %s', nid, symbol)

    def stop(self):
        for nid, (node, sub_id) in list(self._subs.items()):
            self.stream.unsubscribe(sub_id)
        self.stream.stop()
        self._executor.shutdown(wait=False)
        try:
            if self.broadcaster:
                self.broadcaster.stop()
        except Exception:
            logger.exception('Error stopping broadcaster')

    def _on_tick(self, nid: str, tick: dict):
        # called in stream thread; dispatch to executor to avoid blocking stream
        try:
            node = self.nodes.get(nid)
            if not node:
                return
            self._executor.submit(self._safe_on_price, node, tick, nid)
        except Exception:
            logger.exception('Failed to handle tick for %s', nid)

    def _safe_on_price(self, node: Node, tick: dict, nid: str):
        try:
            node.on_price_tick(tick)
            # propagate to downstream nodes (non-blocking)
            for downstream in self._adj.get(nid, []):
                dn = self.nodes.get(downstream)
                if dn is None:
                    continue
                # A node may want to receive the same tick; execute asynchronously
                self._executor.submit(self._safe_forward, dn, tick)
        except Exception:
            logger.exception('Node %s on_price_tick failed', nid)

    def _safe_forward(self, node: Node, tick: dict):
        try:
            node.on_price_tick(tick)
        except Exception:
            logger.exception('Forward to node %s failed', node.name)

    def _broadcast_node(self, nid: str, payload: dict):
        # called when a node emits; forward to websocket clients if available
        try:
            msg = {'node_id': nid, 'node_name': getattr(payload.get('node'), 'name', None), 'value': payload.get('value'), 'tick': payload.get('tick')}
            if self.broadcaster:
                self.broadcaster.broadcast(msg)
        except Exception:
            logger.exception('Failed to broadcast node payload for %s', nid)
