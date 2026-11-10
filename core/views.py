from django.http import Http404
from django.shortcuts import render
from .modes import MODES


def index(request):
    return render(request, 'core/home.html', {'page': 'home', 'modes': MODES})


def heritage(request):
    return render(request, 'core/heritage.html', {'page': 'heritage', 'modes': MODES})


def modes(request):
    return render(request, 'core/modes.html', {'page': 'modes', 'modes': MODES})


def workshop(request, mode_slug):
    mode = next((item for item in MODES if item['slug'] == mode_slug), None)
    if mode is None:
        raise Http404('未找到该剪纸模式')
    return render(request, 'core/workshop.html', {'page': 'workshop', 'mode': mode})


def works(request):
    return render(request, 'core/works.html', {'page': 'works', 'modes': MODES})
