import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../app/theme.dart';

/// The forest band (upgrade 15 §1): forest green with the website's faint zigzag and a soft
/// curve at its foot. The pattern moves at half the scroll speed when [parallax] is given.
class ForestBand extends StatelessWidget {
  const ForestBand({super.key, required this.height, this.curve = 28, this.parallax = 0});

  final double height;
  final double curve;
  final double parallax;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      width: double.infinity,
      child: ClipPath(
        clipper: _CurveClipper(curve),
        child: CustomPaint(painter: _ZigzagPainter(offset: parallax * 0.5)),
      ),
    );
  }
}

class _CurveClipper extends CustomClipper<Path> {
  const _CurveClipper(this.depth);
  final double depth;

  @override
  Path getClip(Size size) {
    if (depth <= 0) return Path()..addRect(Offset.zero & size);
    return Path()
      ..lineTo(0, size.height - depth)
      ..quadraticBezierTo(size.width / 2, size.height + depth * 0.6, size.width, size.height - depth)
      ..lineTo(size.width, 0)
      ..close();
  }

  @override
  bool shouldReclip(_CurveClipper oldClipper) => oldClipper.depth != depth;
}

/// Rows of chevrons (imigongo-like), white at 7 %: present, never loud.
class _ZigzagPainter extends CustomPainter {
  const _ZigzagPainter({this.offset = 0});
  final double offset;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = Palette.forest);
    final line = Paint()
      ..color = Colors.white.withValues(alpha: 0.07)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4;
    const step = 22.0, rise = 9.0, gap = 18.0;
    final shift = offset % gap;
    for (var y = -gap + shift; y < size.height + gap; y += gap) {
      final path = Path()..moveTo(-step, y);
      for (var x = -step; x < size.width + step; x += step) {
        path
          ..lineTo(x + step / 2, y - rise)
          ..lineTo(x + step, y);
      }
      canvas.drawPath(path, line);
    }
    // A soft light from the top right keeps the band from looking flat.
    final glow = Paint()
      ..shader = RadialGradient(
        center: const Alignment(0.9, -1.1),
        radius: 1.1,
        colors: [Colors.white.withValues(alpha: 0.08), Colors.transparent],
      ).createShader(Offset.zero & size);
    canvas.drawRect(Offset.zero & size, glow);
  }

  @override
  bool shouldRepaint(_ZigzagPainter oldDelegate) => oldDelegate.offset != offset;
}

/// The MediLink cross, drawn as one stroke. [progress] 0→1 animates the drawing (splash).
class CrossMark extends StatelessWidget {
  const CrossMark({super.key, this.size = 56, this.progress = 1, this.color = Palette.onForestAccent});

  final double size;
  final double progress;
  final Color color;

  @override
  Widget build(BuildContext context) =>
      CustomPaint(size: Size.square(size), painter: _CrossPainter(progress, color));
}

class _CrossPainter extends CustomPainter {
  const _CrossPainter(this.progress, this.color);
  final double progress;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width;
    final t = s * 0.3; // arm width
    final a = (s - t) / 2;
    final outline = Path()
      ..moveTo(a, 0)
      ..lineTo(a + t, 0)
      ..lineTo(a + t, a)
      ..lineTo(s, a)
      ..lineTo(s, a + t)
      ..lineTo(a + t, a + t)
      ..lineTo(a + t, s)
      ..lineTo(a, s)
      ..lineTo(a, a + t)
      ..lineTo(0, a + t)
      ..lineTo(0, a)
      ..lineTo(a, a)
      ..close();
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = math.max(2, s * 0.05)
      ..strokeJoin = StrokeJoin.round
      ..strokeCap = StrokeCap.round;
    final metric = outline.computeMetrics().first;
    canvas.drawPath(metric.extractPath(0, metric.length * progress.clamp(0, 1)), paint);
    if (progress >= 1) {
      canvas.drawPath(outline, Paint()..color = color.withValues(alpha: 0.16));
    }
  }

  @override
  bool shouldRepaint(_CrossPainter oldDelegate) => oldDelegate.progress != progress;
}
