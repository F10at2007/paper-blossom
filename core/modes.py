"""Shared mode presentation data; fold and free cutting are interactive."""
MODES = (
    {'slug': 'fold', 'number': '01', 'name': '折纸成花', 'tag': '对称之美', 'description': '把一张纸折起，让一次剪裁，在展开时生出意想不到的花。', 'instruction': '选择对折、四折或八折，在亮色区域剪裁，展开一张对称的纸上心意。', 'motif': 'flower', 'tools': ('折叠方式', '剪刀', '展开纸张')},
    {'slug': 'free', 'number': '02', 'name': '自由剪艺', 'tag': '随心而剪', 'description': '不设边界，也不必对称。让心中的线条，在纸上自由生长。', 'instruction': '在纸张上按下拖动，松手自动闭合；圈内区域将被剪去。', 'motif': 'butterfly', 'tools': ('画笔', '剪刀', '线条粗细')},
    {'slug': 'trace', 'number': '03', 'name': '纹样临摹', 'tag': '循纹入艺', 'description': '从一瓣花、一片叶开始，循着传统纹样，读懂剪纸的语言。', 'instruction': '未来可选择参考图案，沿纹样轮廓进行临摹。', 'motif': 'sprig', 'tools': ('参考纹样', '画笔', '参考透明度')},
    {'slug': 'compose', 'number': '04', 'name': '百纹成画', 'tag': '聚形生意', 'description': '花鸟相逢，纹样成章。把小小的图形，组合成自己的纸上故事。', 'instruction': '未来可选择纹样，通过移动、旋转与组合完成创作。', 'motif': 'tiles', 'tools': ('纹样库', '选择', '旋转纹样')},
)
