# Project of Data Visualization (COM-480)

| Student's name | SCIPER |
| -------------- | ------ |
| [Aoyu Gong](https://aoyu.gay/) | 306476 |
| [Arman Maghsoudnia](https://armanma.ch/) | 370707 |
| [Eduard Vlad](https://evlad.de/) | 374438 |
| [Raphael Cannatà](https://raphaelcannata.com/) | 358968 |

[Milestone 1](milestones/milestone1.md) • [Milestone 2](milestones/milestone2.md) • [Milestone 3](milestones/milestone3.md)

# EPFL Room Finder
* [**🎥 Presentation video**]()
* [**📄 Process book**]()

## What is EPFL Room Finder?
EPFL Room Finder is a web application that helps students and staff at EPFL find available rooms for meetings, study sessions, or events. The application provides an interactive map of the campus, allowing users to search for rooms based on their location and availability. Users can filter rooms by type (i.e., lecture halls/study rooms or meeting rooms) and location (i.e., building). The application provides a timeline view of room availability, making it easy for users to find the most suitable room for their needs. 

## Why EPFL Room Finder?
EPFL already has a room occupancy website ([occupancy.epfl.ch](https://occupancy.epfl.ch/)) that should provides information about room availability. However, the current website is often unreachable and offers a poor user experience. EPFL Room Finder aims to provide a more reliable and user-friendly alternative for students and staff.

EPFL relies on the Exchange calendar system to manage room bookings, which is not designed for easy access to room availability information. It is not transparent, it requires users to check each room individually, and wait for a confirmation email to know if the room is available. EPFL Room Finder addresses these issues by providing a centralized platform that aggregates room availability data and presents it in an intuitive way.

## Who is EPFL Room Finder for?
EPFL Room Finder has two main user groups: students and staff. 
* **Students**: Students can use EPFL Room Finder to find free rooms for studying, group work, or social events., without having to rely on the often unreliable occupancy website.
* **Staff**: Staff members can use EPFL Room Finder to more easiliy find availability of rooms that are in the booking system, which currently limits the search to one room at a time.

## Where is the data from?
We contacted the EPFL IT department to obtain access to the room availability data. Unfortunately, we were not able to get access to the data. So, we rely on collecting the data from the occupancy website and we built our own database and API to serve the data to our application. This way, we can ensure that our application provides accurate and up-to-date information about room availability, even if the occupancy website is down.

For the map, we used the OpenStreetMap data for the EPFL campus, and we overlayed the building shapes and locations on the map to provide a visual representation of the campus.

## Repo structure:
```.
├── README.md
```

## Want to contribute?