from django.contrib import admin

from .models import Appointment, AuditEvent, ContactResult, Employee, Facility, Membership, Patient, Route, RouteStep, ScheduleSlot, Service, Specialist, Study, Task, Workspace

admin.site.register([Workspace, Membership, Employee, Patient, Study, Service, Facility, Specialist, Route, RouteStep, ScheduleSlot, Appointment, Task, ContactResult, AuditEvent])
