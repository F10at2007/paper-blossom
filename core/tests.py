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

    def test_each_mode_has_a_shared_workshop_and_clear_placeholder(self):
        self.assertEqual(len(MODES), 4)
        for mode in MODES:
            url = reverse('core:workshop', args=[mode['slug']])
            with self.subTest(mode=mode['slug']):
                self.assertContains(self.client.get(reverse('core:modes')), url)
                response = self.client.get(url)
                self.assertContains(response, mode['name'])
                if mode['slug'] in ('free', 'fold'):
                    self.assertContains(response, 'id="drawing-canvas"')
                    self.assertContains(response, 'data-action="download"')
                    self.assertContains(response, 'js/free-workshop.js')
                    self.assertNotContains(response, '静态示意 · 当前不可绘制')
                else:
                    self.assertContains(response, '静态示意 · 当前不可绘制')
                    self.assertContains(response, 'data-placeholder="保存作品"')
                    self.assertNotContains(response, 'js/free-workshop.js')
                self.assertTemplateUsed(response, 'core/workshop.html')

    def test_unknown_mode_is_not_a_workshop(self):
        self.assertEqual(self.client.get('/workshop/unknown/').status_code, 404)

    def test_examples_are_separate_from_empty_collection(self):
        response = self.client.get(reverse('core:works'))
        self.assertContains(response, '还没有作品')
        self.assertContains(response, '布局示例 · 非真实作品')
