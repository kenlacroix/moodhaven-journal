#!/usr/bin/env python3
"""
mock-peer.py — advertise a fake MoodBloom peer on the LAN for dev testing.

Usage:
  python3 scripts/mock-peer.py
  python3 scripts/mock-peer.py --name "Ken's Phone" --type phone
  python3 scripts/mock-peer.py --name "Ken's Tablet" --type tablet --id aabbccdd11223344

Ctrl+C to stop advertising.
"""

import argparse
import socket
import time
import sys
from zeroconf import ServiceInfo, Zeroconf

SERVICE_TYPE = "_moodbloom._tcp.local."
DEFAULT_PORT  = 42424

def get_local_ip():
    """Best-effort local IP for the primary interface (not loopback)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def main():
    parser = argparse.ArgumentParser(description="Advertise a fake MoodBloom peer via mDNS")
    parser.add_argument("--name",    default="Ken's Phone",       help="Device name")
    parser.add_argument("--type",    default="phone",             choices=["desktop","phone","tablet","watch"])
    parser.add_argument("--id",      default="aabbccdd11223344",  help="16-char hex device ID")
    parser.add_argument("--version", default="0.6.0",             help="App version to advertise")
    parser.add_argument("--port",    default=DEFAULT_PORT, type=int)
    args = parser.parse_args()

    ip = get_local_ip()
    instance = f"moodbloom-{args.id[:8]}"
    hostname  = f"{instance}.local."

    props = {
        "device_id":    args.id,
        "device_name":  args.name,
        "device_type":  args.type,
        "version":      args.version,
        "pubkey_hint":  "mockmock",
    }

    info = ServiceInfo(
        SERVICE_TYPE,
        f"{instance}.{SERVICE_TYPE}",
        addresses=[socket.inet_aton(ip)],
        port=args.port,
        properties=props,
        server=hostname,
    )

    zc = Zeroconf()
    print(f"[mock-peer] Registering  {args.name!r}  ({args.type})  ID={args.id[:8]}…")
    print(f"[mock-peer] IP={ip}  port={args.port}  service={SERVICE_TYPE}")
    print("[mock-peer] Press Ctrl+C to stop\n")

    zc.register_service(info)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        print("\n[mock-peer] Unregistering and shutting down…")
        zc.unregister_service(info)
        zc.close()
        print("[mock-peer] Done.")

if __name__ == "__main__":
    main()
