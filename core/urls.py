from django.urls import path

from . import views

app_name = 'core'

urlpatterns = [
    path('', views.index, name='index'),
    path('heritage/', views.heritage, name='heritage'),
    path('modes/', views.modes, name='modes'),
    path('workshop/<slug:mode_slug>/', views.workshop, name='workshop'),
    path('works/', views.works, name='works'),
]
