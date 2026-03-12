import requests
import xml.etree.ElementTree as ET

url = ("https://plan.epfl.ch/mapserv_proxy?"
       "ogcserver=MapServer&"
       "SERVICE=WFS&VERSION=1.1.0&REQUEST=GetCapabilities")

r = requests.get(url)

root = ET.fromstring(r.content)

ns = {"wfs": "http://www.opengis.net/wfs"}

for t in root.findall(".//{http://www.opengis.net/wfs}FeatureType"):
    name = t.find("{http://www.opengis.net/wfs}Name")
    if name is not None:
        print(name.text)