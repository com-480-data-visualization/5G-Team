# Project of Data Visualization (COM-480)

| Student's name | SCIPER |
| -------------- | ------ |
| Aoyu Gong | 306476 |
| Arman Maghsoudnia | 370707 |
| Eduard Vlad | 374438 |
| Raphael Cannatà | 358968 |

[Milestone 1](#milestone-1) • [Milestone 2](#milestone-2) • [Milestone 3](#milestone-3)

## Milestone 1 (20th March, 5pm)

**10% of the final grade**

This is a preliminary milestone to let you set up goals for your final project and assess the feasibility of your ideas.
Please, fill the following sections about your project.

*(max. 2000 characters per section)*

### Dataset

> Find a dataset (or multiple) that you will explore. Assess the quality of the data it contains and how much preprocessing / data-cleaning it will require before tackling visualization. We recommend using a standard dataset as this course is not about scraping nor data processing.
>
> Hint: some good pointers for finding quality publicly available datasets ([Google dataset search](https://datasetsearch.research.google.com/), [Kaggle](https://www.kaggle.com/datasets), [OpenSwissData](https://opendata.swiss/en/), [SNAP](https://snap.stanford.edu/data/) and [FiveThirtyEight](https://data.fivethirtyeight.com/)).

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

<!-- Beyond EPFL-specific tools, similar systems exist in other contexts. For example:
- Libraries often provide real-time occupancy dashboards to indicate how busy a space is, helping visitors choose the best time to come.
- Universities typically use calendar-based reservation systems (e.g., Outlook/Exchange room calendars) where room availability appears in scheduling interfaces rather than spatial visualizations.
Overall, existing solutions primarily display room availability as lists, calendars, or simple dashboards, with limited spatial interaction or visual exploration. -->

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

## Milestone 2 (17th April, 5pm)

**10% of the final grade**


## Milestone 3 (29th May, 5pm)

**80% of the final grade**


## Late policy

- < 24h: 80% of the grade for the milestone
- < 48h: 70% of the grade for the milestone

