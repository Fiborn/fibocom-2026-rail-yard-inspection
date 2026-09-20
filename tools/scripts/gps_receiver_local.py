from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse
import json
import math

latest_location = {
    "valid": False,
    "latitude": None,
    "longitude": None,
    "speed": None,
}

PI = math.pi
AXIS = 6378245.0
OFFSET = 0.00669342162296594323


def out_of_china(lon, lat):
    return not (73.66 < lon < 135.05 and 3.86 < lat < 53.55)


def transform_lat(lon, lat):
    ret = -100.0 + 2.0 * lon + 3.0 * lat + 0.2 * lat * lat + 0.1 * lon * lat
    ret += 0.2 * math.sqrt(abs(lon))
    ret += (20.0 * math.sin(6.0 * lon * PI) + 20.0 * math.sin(2.0 * lon * PI)) * 2.0 / 3.0
    ret += (20.0 * math.sin(lat * PI) + 40.0 * math.sin(lat / 3.0 * PI)) * 2.0 / 3.0
    ret += (160.0 * math.sin(lat / 12.0 * PI) + 320.0 * math.sin(lat * PI / 30.0)) * 2.0 / 3.0
    return ret


def transform_lon(lon, lat):
    ret = 300.0 + lon + 2.0 * lat + 0.1 * lon * lon + 0.1 * lon * lat
    ret += 0.1 * math.sqrt(abs(lon))
    ret += (20.0 * math.sin(6.0 * lon * PI) + 20.0 * math.sin(2.0 * lon * PI)) * 2.0 / 3.0
    ret += (20.0 * math.sin(lon * PI) + 40.0 * math.sin(lon / 3.0 * PI)) * 2.0 / 3.0
    ret += (150.0 * math.sin(lon / 12.0 * PI) + 300.0 * math.sin(lon / 30.0 * PI)) * 2.0 / 3.0
    return ret


def gps_to_amap(lon, lat):
    """Convert WGS84 GPS coordinates to GCJ-02 used by AMap, without network."""
    lon = float(lon)
    lat = float(lat)
    if out_of_china(lon, lat):
        return lon, lat

    d_lat = transform_lat(lon - 105.0, lat - 35.0)
    d_lon = transform_lon(lon - 105.0, lat - 35.0)
    rad_lat = lat / 180.0 * PI
    magic = math.sin(rad_lat)
    magic = 1 - OFFSET * magic * magic
    sqrt_magic = math.sqrt(magic)
    d_lat = (d_lat * 180.0) / ((AXIS * (1 - OFFSET)) / (magic * sqrt_magic) * PI)
    d_lon = (d_lon * 180.0) / (AXIS / sqrt_magic * math.cos(rad_lat) * PI)
    return lon + d_lon, lat + d_lat


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        global latest_location
        parsed = urlparse(self.path)

        if parsed.path == "/location":
            body = json.dumps(latest_location, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
            return

        query = parse_qs(parsed.query)
        lat = query.get("lat", [""])[0]
        lon = query.get("longitude", query.get("lon", [""]))[0]
        speed = query.get("speed", [""])[0]

        if lat and lon:
            try:
                amap_lon, amap_lat = gps_to_amap(lon, lat)
                latest_location = {
                    "valid": True,
                    "latitude": amap_lat,
                    "longitude": amap_lon,
                    "speed": speed,
                }
                print("received gps:", lat, lon, "=>", amap_lat, amap_lon, "speed:", speed)
            except Exception as exc:
                print("location update failed:", exc)

        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"OK")


server = HTTPServer(("0.0.0.0", 5001), Handler)
print("GPS receiver started.")
print("Listening: 0.0.0.0:5001")
print("Location API: http://127.0.0.1:5001/location")
print("Waiting for phone location...")
server.serve_forever()
