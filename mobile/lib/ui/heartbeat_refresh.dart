import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app/theme.dart';

/// Pull to refresh with a heartbeat line (upgrade 15 §3): pulling draws the line, releasing past
/// the mark makes it pulse until [onRefresh] completes, then a light vibration.
/// The child must be a vertical scrollable with AlwaysScrollableScrollPhysics.
class HeartbeatRefresh extends StatefulWidget {
  const HeartbeatRefresh({super.key, required this.onRefresh, required this.child, this.onForest = false});

  final Future<void> Function() onRefresh;
  final Widget child;
  final bool onForest;

  @override
  State<HeartbeatRefresh> createState() => _HeartbeatRefreshState();
}

class _HeartbeatRefreshState extends State<HeartbeatRefresh> with SingleTickerProviderStateMixin {
  static const _trigger = 90.0;
  double _pull = 0;
  bool _refreshing = false;
  late final AnimationController _beat =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 900));

  @override
  void dispose() {
    _beat.dispose();
    super.dispose();
  }

  bool _onNotification(ScrollNotification n) {
    if (_refreshing || n.metrics.axis != Axis.vertical) return false;
    if (n is ScrollUpdateNotification && n.metrics.pixels < 0 && n.dragDetails != null) {
      setState(() => _pull = -n.metrics.pixels);
    } else if (n is OverscrollNotification && n.overscroll < 0 && n.dragDetails != null) {
      setState(() => _pull = (_pull - n.overscroll).clamp(0, _trigger * 1.6));
    } else if (n is ScrollUpdateNotification && n.metrics.pixels > 0 && _pull > 0) {
      setState(() => _pull = 0);
    } else if (n is ScrollEndNotification || (n is UserScrollNotification && n.direction.name == 'idle')) {
      if (_pull >= _trigger) {
        _run();
      } else if (_pull > 0) {
        setState(() => _pull = 0);
      }
    }
    return false;
  }

  Future<void> _run() async {
    setState(() => _refreshing = true);
    _beat.repeat();
    HapticFeedback.selectionClick();
    try {
      await widget.onRefresh();
      HapticFeedback.lightImpact();
    } finally {
      if (mounted) {
        _beat.stop();
        setState(() {
          _refreshing = false;
          _pull = 0;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final progress = _refreshing ? 1.0 : (_pull / _trigger).clamp(0.0, 1.0);
    final color = widget.onForest ? Palette.onForestAccent : Palette.brand;
    return Stack(
      children: [
        NotificationListener<ScrollNotification>(onNotification: _onNotification, child: widget.child),
        if (progress > 0)
          Positioned(
            top: MediaQuery.paddingOf(context).top + 8,
            left: 0,
            right: 0,
            child: IgnorePointer(
              child: Center(
                child: AnimatedBuilder(
                  animation: _beat,
                  builder: (context, _) => CustomPaint(
                    size: const Size(120, 32),
                    painter: _HeartbeatPainter(progress, _refreshing ? _beat.value : null, color),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _HeartbeatPainter extends CustomPainter {
  _HeartbeatPainter(this.progress, this.pulse, this.color);
  final double progress;
  final double? pulse;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height, mid = h / 2;
    final path = Path()
      ..moveTo(0, mid)
      ..lineTo(w * 0.30, mid)
      ..lineTo(w * 0.38, mid - h * 0.15)
      ..lineTo(w * 0.44, mid + h * 0.12)
      ..lineTo(w * 0.52, mid - h * 0.48)
      ..lineTo(w * 0.60, mid + h * 0.40)
      ..lineTo(w * 0.66, mid)
      ..lineTo(w, mid);
    final metric = path.computeMetrics().first;
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.4
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..color = color.withValues(alpha: 0.25);
    canvas.drawPath(metric.extractPath(0, metric.length * progress), paint);
    if (pulse != null) {
      // A bright segment travels along the line once per beat.
      final start = metric.length * pulse!;
      canvas.drawPath(
        metric.extractPath(start, start + metric.length * 0.28),
        paint..color = color,
      );
    } else {
      canvas.drawPath(metric.extractPath(0, metric.length * progress), paint..color = color);
    }
  }

  @override
  bool shouldRepaint(_HeartbeatPainter old) => old.progress != progress || old.pulse != pulse;
}
