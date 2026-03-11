## Milestone 1 (20th March, 5pm)



**10% of the final grade**

This is a preliminary milestone to let you set up goals for your final project and assess the feasibility of your ideas.
Please, fill the following sections about your project.

*(max. 2000 characters per section)*

### Dataset

Our dataset consists of the publicly available EPFL occupancy data. We retrieve them using the public API:

```bash
curl -X GET "https://ewa.epfl.ch/room/Default.aspx?room=inm201" | grep "v.events" | sed 's/v.events = //' | sed 's/;//' | jq .
```
The abovegiven command yields the following result which forms the base of our dataset.

<details>
<summary>JSON</summary>
  
```json
[
  {
    "ResizeDisabled": true,
    "Header": "15:15 - 17:00",
    "Tag": [
      "ISA - Game design & prototyping<br>",
      "inm20146"
    ],
    "Start": "2026-03-09T15:15:00",
    "FontColor": "#000000",
    "BorderColor": "#42658C",
    "ClickDisabled": true,
    "Value": "inm20146",
    "Resource": null,
    "AllDay": false,
    "BackColor": "#C3D9FF",
    "RecurrentMasterId": null,
    "DeleteDisabled": true,
    "End": "2026-03-09T17:00:00",
    "DoubleClickDisabled": true,
    "Text": "ISA - Game design & prototyping<br>",
    "Recurrent": false,
    "MoveDisabled": true,
    "Sort": null
  },
  {
    "ResizeDisabled": true,
    "Header": "15:15 - 17:00",
    "Tag": [
      "ISA - Relativity and cosmology II<br>",
      "inm20147"
    ],
    "Start": "2026-03-10T15:15:00",
    "FontColor": "#000000",
    "BorderColor": "#42658C",
    "ClickDisabled": true,
    "Value": "inm20147",
    "Resource": null,
    "AllDay": false,
    "BackColor": "#C3D9FF",
    "RecurrentMasterId": null,
    "DeleteDisabled": true,
    "End": "2026-03-10T17:00:00",
    "DoubleClickDisabled": true,
    "Text": "ISA - Relativity and cosmology II<br>",
    "Recurrent": false,
    "MoveDisabled": true,
    "Sort": null
  },
  {
    "ResizeDisabled": true,
    "Header": "17:15 - 19:00",
    "Tag": [
      "ISA - Relativity and cosmology II<br>",
      "inm20148"
    ],
    "Start": "2026-03-10T17:15:00",
    "FontColor": "#000000",
    "BorderColor": "#42658C",
    "ClickDisabled": true,
    "Value": "inm20148",
    "Resource": null,
    "AllDay": false,
    "BackColor": "#C3D9FF",
    "RecurrentMasterId": null,
    "DeleteDisabled": true,
    "End": "2026-03-10T19:00:00",
    "DoubleClickDisabled": true,
    "Text": "ISA - Relativity and cosmology II<br>",
    "Recurrent": false,
    "MoveDisabled": true,
    "Sort": null
  },
  {
    "ResizeDisabled": true,
    "Header": "08:15 - 10:00",
    "Tag": [
      "ISA - Astrophysics IV : stellar and galactic dynamics<br>",
      "inm20149"
    ],
    "Start": "2026-03-11T08:15:00",
    "FontColor": "#000000",
    "BorderColor": "#42658C",
    "ClickDisabled": true,
    "Value": "inm20149",
    "Resource": null,
    "AllDay": false,
    "BackColor": "#C3D9FF",
    "RecurrentMasterId": null,
    "DeleteDisabled": true,
    "End": "2026-03-11T10:00:00",
    "DoubleClickDisabled": true,
    "Text": "ISA - Astrophysics IV : stellar and galactic dynamics<br>",
    "Recurrent": false,
    "MoveDisabled": true,
    "Sort": null
  },
  {
    "ResizeDisabled": true,
    "Header": "10:15 - 12:00",
    "Tag": [
      "ISA - Astrophysics IV : stellar and galactic dynamics<br>",
      "inm20150"
    ],
    "Start": "2026-03-11T10:15:00",
    "FontColor": "#000000",
    "BorderColor": "#42658C",
    "ClickDisabled": true,
    "Value": "inm20150",
    "Resource": null,
    "AllDay": false,
    "BackColor": "#C3D9FF",
    "RecurrentMasterId": null,
    "DeleteDisabled": true,
    "End": "2026-03-11T12:00:00",
    "DoubleClickDisabled": true,
    "Text": "ISA - Astrophysics IV : stellar and galactic dynamics<br>",
    "Recurrent": false,
    "MoveDisabled": true,
    "Sort": null
  },
  {
    "ResizeDisabled": true,
    "Header": "14:15 - 16:00",
    "Tag": [
      "ISA - Introduction to magnetic materials in modern technologies<br>",
      "inm20151"
    ],
    "Start": "2026-03-11T14:15:00",
    "FontColor": "#000000",
    "BorderColor": "#42658C",
    "ClickDisabled": true,
    "Value": "inm20151",
    "Resource": null,
    "AllDay": false,
    "BackColor": "#C3D9FF",
    "RecurrentMasterId": null,
    "DeleteDisabled": true,
    "End": "2026-03-11T16:00:00",
    "DoubleClickDisabled": true,
    "Text": "ISA - Introduction to magnetic materials in modern technologies<br>",
    "Recurrent": false,
    "MoveDisabled": true,
    "Sort": null
  },
  {
    "ResizeDisabled": true,
    "Header": "16:15 - 19:00",
    "Tag": [
      "ISA - Culture médiatique II<br>",
      "inm20152"
    ],
    "Start": "2026-03-11T16:15:00",
    "FontColor": "#000000",
    "BorderColor": "#42658C",
    "ClickDisabled": true,
    "Value": "inm20152",
    "Resource": null,
    "AllDay": false,
    "BackColor": "#C3D9FF",
    "RecurrentMasterId": null,
    "DeleteDisabled": true,
    "End": "2026-03-11T19:00:00",
    "DoubleClickDisabled": true,
    "Text": "ISA - Culture médiatique II<br>",
    "Recurrent": false,
    "MoveDisabled": true,
    "Sort": null
  },
  {
    "ResizeDisabled": true,
    "Header": "19:00 - 22:00",
    "Tag": [
      "ISA - Evénements<br>",
      "inm20153"
    ],
    "Start": "2026-03-11T19:00:00",
    "FontColor": "#000000",
    "BorderColor": "#42658C",
    "ClickDisabled": true,
    "Value": "inm20153",
    "Resource": null,
    "AllDay": false,
    "BackColor": "#C3D9FF",
    "RecurrentMasterId": null,
    "DeleteDisabled": true,
    "End": "2026-03-11T22:00:00",
    "DoubleClickDisabled": true,
    "Text": "ISA - Evénements<br>",
    "Recurrent": false,
    "MoveDisabled": true,
    "Sort": null
  },
  {
    "ResizeDisabled": true,
    "Header": "09:15 - 10:00",
    "Tag": [
      "ISA - Laser fundamentals and applications for engineers<br>",
      "inm20154"
    ],
    "Start": "2026-03-12T09:15:00",
    "FontColor": "#000000",
    "BorderColor": "#42658C",
    "ClickDisabled": true,
    "Value": "inm20154",
    "Resource": null,
    "AllDay": false,
    "BackColor": "#C3D9FF",
    "RecurrentMasterId": null,
    "DeleteDisabled": true,
    "End": "2026-03-12T10:00:00",
    "DoubleClickDisabled": true,
    "Text": "ISA - Laser fundamentals and applications for engineers<br>",
    "Recurrent": false,
    "MoveDisabled": true,
    "Sort": null
  },
  {
    "ResizeDisabled": true,
    "Header": "10:15 - 12:00",
    "Tag": [
      "ISA - Analyse II<br>",
      "inm20155"
    ],
    "Start": "2026-03-12T10:15:00",
    "FontColor": "#000000",
    "BorderColor": "#42658C",
    "ClickDisabled": true,
    "Value": "inm20155",
    "Resource": null,
    "AllDay": false,
    "BackColor": "#C3D9FF",
    "RecurrentMasterId": null,
    "DeleteDisabled": true,
    "End": "2026-03-12T12:00:00",
    "DoubleClickDisabled": true,
    "Text": "ISA - Analyse II<br>",
    "Recurrent": false,
    "MoveDisabled": true,
    "Sort": null
  },
  {
    "ResizeDisabled": true,
    "Header": "12:00 - 13:00",
    "Tag": [
      "ISA - Réservation ponctuelle<br>",
      "inm20156"
    ],
    "Start": "2026-03-12T12:00:00",
    "FontColor": "#000000",
    "BorderColor": "#42658C",
    "ClickDisabled": true,
    "Value": "inm20156",
    "Resource": null,
    "AllDay": false,
    "BackColor": "#C3D9FF",
    "RecurrentMasterId": null,
    "DeleteDisabled": true,
    "End": "2026-03-12T13:00:00",
    "DoubleClickDisabled": true,
    "Text": "ISA - Réservation ponctuelle<br>",
    "Recurrent": false,
    "MoveDisabled": true,
    "Sort": null
  },
  {
    "ResizeDisabled": true,
    "Header": "16:15 - 17:00",
    "Tag": [
      "ISA - Mécanique statistique pour la chimie<br>",
      "inm20157"
    ],
    "Start": "2026-03-12T16:15:00",
    "FontColor": "#000000",
    "BorderColor": "#42658C",
    "ClickDisabled": true,
    "Value": "inm20157",
    "Resource": null,
    "AllDay": false,
    "BackColor": "#C3D9FF",
    "RecurrentMasterId": null,
    "DeleteDisabled": true,
    "End": "2026-03-12T17:00:00",
    "DoubleClickDisabled": true,
    "Text": "ISA - Mécanique statistique pour la chimie<br>",
    "Recurrent": false,
    "MoveDisabled": true,
    "Sort": null
  },
  {
    "ResizeDisabled": true,
    "Header": "08:15 - 10:00",
    "Tag": [
      "ISA - Signal processing<br>",
      "inm20158"
    ],
    "Start": "2026-03-13T08:15:00",
    "FontColor": "#000000",
    "BorderColor": "#42658C",
    "ClickDisabled": true,
    "Value": "inm20158",
    "Resource": null,
    "AllDay": false,
    "BackColor": "#C3D9FF",
    "RecurrentMasterId": null,
    "DeleteDisabled": true,
    "End": "2026-03-13T10:00:00",
    "DoubleClickDisabled": true,
    "Text": "ISA - Signal processing<br>",
    "Recurrent": false,
    "MoveDisabled": true,
    "Sort": null
  },
  {
    "ResizeDisabled": true,
    "Header": "10:15 - 12:00",
    "Tag": [
      "ISA - Fault-tolerant quantum computing<br>",
      "inm20159"
    ],
    "Start": "2026-03-13T10:15:00",
    "FontColor": "#000000",
    "BorderColor": "#42658C",
    "ClickDisabled": true,
    "Value": "inm20159",
    "Resource": null,
    "AllDay": false,
    "BackColor": "#C3D9FF",
    "RecurrentMasterId": null,
    "DeleteDisabled": true,
    "End": "2026-03-13T12:00:00",
    "DoubleClickDisabled": true,
    "Text": "ISA - Fault-tolerant quantum computing<br>",
    "Recurrent": false,
    "MoveDisabled": true,
    "Sort": null
  },
  {
    "ResizeDisabled": true,
    "Header": "16:15 - 17:00",
    "Tag": [
      "ISA - Information, calcul, communication<br>",
      "inm20160"
    ],
    "Start": "2026-03-13T16:15:00",
    "FontColor": "#000000",
    "BorderColor": "#42658C",
    "ClickDisabled": true,
    "Value": "inm20160",
    "Resource": null,
    "AllDay": false,
    "BackColor": "#C3D9FF",
    "RecurrentMasterId": null,
    "DeleteDisabled": true,
    "End": "2026-03-13T17:00:00",
    "DoubleClickDisabled": true,
    "Text": "ISA - Information, calcul, communication<br>",
    "Recurrent": false,
    "MoveDisabled": true,
    "Sort": null
  }
]

```

</details>

### Problematic

We will visualize the occupancy of EPFL's rooms to provide availability information for a given time period.
We will visualize the data on an [EPFL map](https://map.epfl.ch/). Going over rooms and clicking them would also provide the availability information. 

We will also provide a tool to visualize all the rooms that are available at a given time, which would be useful for students looking for a place to study, or for personnel looking to reserve a room for a meeting or event.

There has been no reliable method of providing the availabity with appealing visualization yet.

The target audience would be both personnel who can reserve the rooms if available, and students who might use a room as a study place if not used by a lecturer. 

### Exploratory Data Analysis

> Pre-processing of the data set you chose
> - Show some basic statistics and get insights about the data

### Related work

#### 1. What others have already done with the data?
Other tools and services already use EPFL room reservation and scheduling data, although they often focus more on functional access to information than on advanced visualization.

* One example is [occupancy.epfl.ch](https://occupancy.epfl.ch/) platform, which allows users to check room occupancy based on course schedules. 
The interface typically presents availability information in a time-based table or list, enabling users to see whether a room is free during a specific time slot. However, the visualization is relatively simple and mostly textual.

* The exchange calendar of EPFL personnel also provides a way of checking room availability, but it is primarily designed for scheduling meetings and events rather than providing a spatial overview of available rooms. For example, to find an availble room, users need to iteratively check the calendar for each room, until they find one that is free for the selected time period. This process can be time-consuming and does not offer a visual representation of room availability across the campus. Moreover, this feature is not easily accessible to students, who may not have permissions to view all room calendars.

* Another example is [rEPFL](https://repfl.ch/), a community-built website that aggregates information about available rooms across the EPFL campus. 
It provides students with an easy way to discover rooms that may be free for studying or working. 
The interface simplifies the search process but still focuses mostly on lists of rooms and availability indicators, rather than spatial or exploratory visualizations.

* Another related project is [Occupancy FLEP](https://occupancy.flep.ch/), a student-built platform that provides real-time information about available rooms across the EPFL campus. Its goal is to help students quickly find study spaces, especially during busy periods. 
The platform aggregates scheduling information and presents it in a clear interface to reduce the time spent searching for rooms.

#### 2. Why is your approach original?
The originality of our approach lies in the integration of room occupancy data with an interactive spatial visualization of the EPFL campus.
Instead of presenting availability in a textual schedule or calendar format, our project:

- Displays rooms directly on an EPFL campus map, linking spatial context with scheduling data.
- Allows users to hover over or click on rooms to instantly view availability for a chosen time period.
- Makes it easier to discover nearby available rooms, which is difficult when using traditional schedule tables.
- Provides a more intuitive and exploratory interface, especially for students looking for quick study spaces.

This spatial visualization transforms room availability data into a navigable environment, helping users understand not only when rooms are free but also where they are located.
By combining scheduling data with geographic context, the visualization improves usability and situational awareness compared to existing tools.

#### 3. What sources of inspiration influenced the project?
Several types of visualization inspired our approach.

1. Interactive maps
   Many modern web applications use interactive maps with clickable elements to explore spatial data. Examples include:
   
   - campus maps showing facilities
   - real-estate availability maps
   - transportation or traffic visualizations
   
   These interfaces allow users to explore data geographically, which improves discoverability and usability.

3. Room occupancy dashboards
   Applications used in libraries or coworking spaces often display real-time occupancy indicators, such as percentages or color-coded availability levels. These dashboards inspired the idea of visually representing room availability rather than only listing it.

4. Data-driven interactive visualizations
   Popular visualization platforms such as:
   
   - Datawrapper
   - Observable
   - interactive news graphics
   
   often combine interaction, filtering, and visual encoding to help users explore datasets intuitively. Our design similarly emphasizes exploration through interaction.
