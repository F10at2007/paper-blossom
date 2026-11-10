from django.test import TestCase
from django.urls import reverse
from .modes import MODES


class WorkshopPagesTests(TestCase):
    def test_navigation_pages(self):
        for name in ('index', 'modes', 'works'):
            with self.subTest(page=name):
                response = self.client.get(reverse(f'core:{name}'))
                self.assertEqual(response.status_code, 200)
                self.assertContains(response, '一纸生花')
                self.assertContains(response, reverse('core:modes'))

    def test_four_interactive_modes_have_canvas_and_manual_save(self):
        self.assertEqual(len(MODES), 4)
        for mode in MODES:
            url = reverse('core:workshop', args=[mode['slug']])
            with self.subTest(mode=mode['slug']):
                self.assertContains(self.client.get(reverse('core:modes')), url)
                response = self.client.get(url)
                self.assertContains(response, mode['name'])
                self.assertContains(response, 'id="drawing-canvas"')
                self.assertContains(response, 'data-action="download"')
                self.assertContains(response, 'data-action="save"')
                if mode['slug'] in ('free','fold'):
                    self.assertContains(response, 'js/free-workshop.js')
                elif mode['slug']=='trace':
                    self.assertContains(response,'js/trace-workshop.js')
                    self.assertContains(response,'id="reference-canvas"')
                else:self.assertContains(response,'js/compose-workshop.js')
                self.assertNotContains(response,'静态示意 · 当前不可绘制')
                self.assertTemplateUsed(response, 'core/workshop.html')

    def test_unknown_mode_is_not_a_workshop(self):
        self.assertEqual(self.client.get('/workshop/unknown/').status_code, 404)

    def test_works_has_real_storage_management_without_fake_examples(self):
        response = self.client.get(reverse('core:works'))
        self.assertContains(response,'id="works-list"')
        self.assertContains(response,'id="works-empty"')
        self.assertContains(response,'js/my-works.js')
        self.assertNotContains(response,'布局示例 · 非真实作品')

    def test_home_desktop_resources_follow_stage_breakpoint(self):
        response = self.client.get(reverse('core:index'))
        self.assertContains(response, 'media="(min-width: 901px) and (max-width: 1080px)"')
        self.assertNotContains(response, 'bg-stage-720.webp')
        self.assertContains(response, 'js/pop-defer.js')
        self.assertContains(response, 'data-src="/static/core/media/card-free-pop.webp"')
