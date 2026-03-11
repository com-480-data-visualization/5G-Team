#! /usr/bin/env python3
import requests
import os
import json
from datetime import *

def query_force(query, max_retry=50):
    for _ in range(max_retry):
        response = query()
        if response.status_code == 200:
            return response
    return None

def parse_events(response):
    if not response or not response.text:
        return []

    events_line = response.text.split('0|')[1]

    if not events_line:
        return []

    # Do a little bit of parsing
    room_occupancy = (events_line.replace(';', '')
                                 .replace('\\"', '')
                                 .replace('<br>', '')
                                 .replace('ISA - ', '')
                                 .replace('\\', ''))
    
    parsed_room_occupancy = json.loads(room_occupancy)['Events']

    events_tags = ['Evénements', 'Réservation académique', 'Réservation ponctuelle']
    
    # Filter events based on the specified tags
    filtered_events = [event for event in parsed_room_occupancy if event['Text'] in events_tags]

    # Keep only the relevant fields
    filtered_events = [{k: event[k] for k in ['Text', 'Start', 'End']} for event in filtered_events]

    return filtered_events


def parse_next_week(room_name, week_offset):
    start_date = datetime.now()

    # start_date to begin of the week
    begin_of_week = start_date - timedelta(days=start_date.weekday())

    start_date = begin_of_week + timedelta(days=7)
    end_date = start_date + timedelta(days=7)
    
    start_date = start_date + timedelta(days=week_offset * 7)
    end_date = end_date + timedelta(days=week_offset * 7)

    # start of day
    start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end_date = end_date.replace(hour=0, minute=0, second=0, microsecond=0)

    # Str
    start_date = start_date.strftime("%Y-%m-%dT%H:%M:%S")
    end_date = end_date.strftime("%Y-%m-%dT%H:%M:%S")

    print(f'start_date={start_date} end_date={end_date}')
    response = query_force(lambda: query_room(room_name, start_date, end_date), max_retry=100)

    print(response.text)
    if not response:
        print(f'No response for {room_name}')
        return []
    return parse_events(response)

def query_room(room_name, start_date, end_date):
    data = {
        'MIME Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        '__EVENTTARGET': '',
        '__EVENTARGUMENT': '',
        '__VIEWSTATE': '',
        '__VIEWSTATEGENERATOR': 'CC8E5E3B',
        '__CALLBACKID': 'ctl00$ContentPlaceHolder1$DayPilotCalendar1',
        '__CALLBACKPARAM': """JSON{"action":"Command","parameters":{"command":"navigate"},"data":{"start":\"""" + start_date + '","end":"' + end_date + """\","days":7},"header":{"control":"dpc","id":"ContentPlaceHolder1_DayPilotCalendar1","clientState":{},"columns":[{"Value":null,"Name":"08.01.2024","ToolTip":null,"Date":"2024-01-08T00:00:00","Children":[]},{"Value":null,"Name":"09.01.2024","ToolTip":null,"Date":"2024-01-09T00:00:00","Children":[]},{"Value":null,"Name":"10.01.2024","ToolTip":null,"Date":"2024-01-10T00:00:00","Children":[]},{"Value":null,"Name":"11.01.2024","ToolTip":null,"Date":"2024-01-11T00:00:00","Children":[]},{"Value":null,"Name":"12.01.2024","ToolTip":null,"Date":"2024-01-12T00:00:00","Children":[]},{"Value":null,"Name":"13.01.2024","ToolTip":null,"Date":"2024-01-13T00:00:00","Children":[]},{"Value":null,"Name":"14.01.2024","ToolTip":null,"Date":"2024-01-14T00:00:00","Children":[]}],"days":7,"startDate":"2024-01-08T00:00:00","cellDuration":30,"heightSpec":"BusinessHours","businessBeginsHour":7,"businessEndsHour":20,"viewType":"Days","dayBeginsHour":0,"dayEndsHour":0,"headerLevels":1,"backColor":"White","nonBusinessBackColor":"White","eventHeaderVisible":true,"timeFormat":"Clock12Hours","showAllDayEvents":true,"tagFields":["name","id"],"hourNameBackColor":"#F3F3F9","hourFontFamily":"Tahoma,Verdana,Sans-serif","hourFontSize":"16pt","hourFontColor":"#42658C","selected":"","hashes":{"callBack":"OV+dLKlTRpwauhSy/FtI1aLjgoc=","columns":"IhqLqz4fVg5t3JL4XXO3ZfZvJRA=","events":"NqagU2+lBsSSGcEgjzHvWAy3Rds=","colors":"3caslJYaCfbLdelD4+2YHVvrvn8=","hours":"K+iMpCQsduglOsYkdIUQZQMtaDM=","corner":"0XBQYL2rjFh+nn9As5pzf4+hWqg="}}}"""
    }

    headers = {
        'Connection': 'keep-alive',
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        'Cookie': 'ASP.NET_SessionId=j4t3wqpmo03taquol3rnq2m5; petitpois=dismiss;',
        'Origin': 'https://ewa.epfl.ch',
        'Referer': f'https://ewa.epfl.ch/room/Default.aspx?room={room_name}',
       }

    response = requests.post('https://ewa.epfl.ch/room/Default.aspx', headers=headers, data=data)
    print(f"got response={response}")

    return response


if __name__ == "__main__":
    x = parse_next_week("bc133", -2)
    y = parse_next_week("bc133", 0)
    print(y == x)
