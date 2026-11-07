import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app/theme.dart';

/// The forest band (upgrade 15 §1): forest green with the website's faint zigzag and a soft
/// curve at its foot, the same [Space.curve] on every main tab. The pattern moves at half the
/// scroll speed when [parallax] is given. The status bar icons turn light over it.
class ForestBand extends StatelessWidget {
  const ForestBand({super.key, required this.height, this.curve = Space.curve, this.parallax = 0});

  final double height;
  final double curve;
  final double parallax;

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(statusBarColor: Colors.transparent),
      child: SizedBox(
        height: height,
        width: double.infinity,
        child: ClipPath(
          clipper: _CurveClipper(curve),
          child: CustomPaint(painter: _ZigzagPainter(offset: parallax * 0.5)),
        ),
      ),
    );
  }
}

/// The band's curved foot in the page colour, laid over the bottom of a picture or a coloured
/// header (doctor, facility) so detail pages end in the same curve as the main tabs.
class BandFoot extends StatelessWidget {
  const BandFoot({super.key, this.depth = Space.curve, this.color = Palette.page});

  final double depth;
  final Color color;

  @override
  Widget build(BuildContext context) => IgnorePointer(
        child: SizedBox(
          height: depth,
          width: double.infinity,
          child: CustomPaint(painter: _FootPainter(color)),
        ),
      );
}

class _FootPainter extends CustomPainter {
  const _FootPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    // The area under the band's curve (see _CurveClipper), filled with the page colour.
    final d = size.height;
    final path = Path()
      ..moveTo(0, 0)
      ..quadraticBezierTo(size.width / 2, d * 1.6, size.width, 0)
      ..lineTo(size.width, d + 1)
      ..lineTo(0, d + 1)
      ..close();
    canvas.drawPath(path, Paint()..color = color);
  }

  @override
  bool shouldRepaint(_FootPainter oldDelegate) => oldDelegate.color != color;
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
