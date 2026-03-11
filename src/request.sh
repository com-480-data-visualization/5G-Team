#! /bin/bash

ROOOM=$1
JSON_BODY=$(<"./src/req2_parm.json")

# echo "________BODY________"
# echo $JSON_BODY
# echo "________BODY________"

curl -X POST "https://ewa.epfl.ch/room/Default.aspx?room=${ROOM}" \
    --data-urlencode '__EVENTTARGET=' \
    --data-urlencode '__EVENTARGUMENT=' \
    --data-urlencode '__VIEWSTATE=' \
    --data-urlencode '__VIEWSTATEGENERATOR=CC8E5E3B' \
    --data-urlencode '__CALLBACKID=ctl00$ContentPlaceHolder1$DayPilotCalendar1' \
    --data-urlencode "__CALLBACKPARAM=JSON${JSON_BODY}"
    #grep v.events | sed 's/v.events = //' | sed 's/;//' | jq .
