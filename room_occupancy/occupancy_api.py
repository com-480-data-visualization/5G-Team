import os
from fastapi import FastAPI, HTTPException, Header, Request, Query
from pymongo import MongoClient
from pymongo.errors import OperationFailure
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "https://ftpsens.epfl.ch"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


mongo_uri = os.environ["MONGO_URI"]
api_key = os.environ["API_KEY"]

client = MongoClient(mongo_uri)
db = client["appdb"]
collection = db["items"]

@app.get("/items")
def get_items(
    room: str | None = Query(default=None),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
):
    try:
        query = {}

        if room:
            query["room"] = room

        if start_date or end_date:
            query["date"] = {}
            if start_date:
                query["date"]["$gte"] = start_date
            if end_date:
                query["date"]["$lte"] = end_date

        docs = list(
            collection.find(query, {"_id": 0}).sort([("date", 1), ("room", 1)])
        )
        return docs

    except OperationFailure as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/items")
def add_item(
    request: Request,
    payload: dict,
    x_api_key: str | None = Header(default=None)
):
    if x_api_key != api_key:
        raise HTTPException(status_code=403, detail="API token wrong")

    if not payload:
        raise HTTPException(status_code=400, detail="Empty payload")
    
    # print(f"PAYLOAD={payload}")

    count = upsert_room_days(payload['payload'])
    return {"updated": count}


def upsert_room_days(docs) -> int:
    count = 0

    for doc in docs:
        collection.update_one(
            {"room": doc["room"], "date": doc["date"]},
            {"$set": doc},
            upsert=True,
        )
        count += 1

    return count
