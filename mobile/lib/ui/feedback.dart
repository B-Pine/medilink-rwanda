import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'icons.dart';

import '../app/strings.dart';
import '../app/theme.dart';
import '../data/api.dart';

/// Grey shapes the size of the real content with a soft shine sweeping across (no spinners).
class Skeleton extends StatefulWidget {
  const Skeleton({super.key, this.width, this.height = 14, this.radius = 6, this.onForest = false});

  final double? width;
  final double height;
  final double radius;
  final bool onForest;

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton> with SingleTickerProviderStateMixin {
  // Created on first animated build only: with animations off it never exists, and dispose()
  // must not create it (that looks up TickerMode on a deactivated element).
  AnimationController? _controller;
  AnimationController get _shine => _controller ??=
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1300))..repeat();

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final base = widget.onForest ? Palette.forestRaised : Palette.skeleton;
    final reduce = MediaQuery.of(context).disableAnimations;
    final box = Container(
      width: widget.width,
      height: widget.height,
      decoration: BoxDecoration(color: base, borderRadius: BorderRadius.circular(widget.radius)),
    );
    if (reduce) return box;
    return AnimatedBuilder(
      animation: _shine,
      builder: (context, child) => ShaderMask(
        blendMode: BlendMode.srcATop,
        shaderCallback: (rect) => LinearGradient(
          begin: Alignment(-1 + _shine.value * 3, 0),
          end: Alignment(_shine.value * 3, 0),
          colors: [base, Colors.white.withValues(alpha: widget.onForest ? 0.10 : (Palette.dark ? 0.06 : 0.55)), base],
          stops: const [0.35, 0.5, 0.65],
        ).createShader(rect),
        child: child,
      ),
      child: box,
    );
  }
}

/// A card-shaped skeleton for lists.
class SkeletonCard extends StatelessWidget {
  const SkeletonCard({super.key, this.lines = 2});
  final int lines;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(Space.lg),
        child: Row(
          children: [
            const Skeleton(width: 44, height: 44, radius: 10),
            const SizedBox(width: Space.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Skeleton(width: 160, height: 15),
                  for (var i = 1; i < lines; i++) ...[
                    const SizedBox(height: Space.sm),
                    const Skeleton(width: 110, height: 12),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.count = 4});
  final int count;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          for (var i = 0; i < count; i++) ...[const SkeletonCard(), const SizedBox(height: Space.md)],
        ],
      );
}

/// An icon and one line, with an optional action (upgrade 15: empty states).
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.text, this.action, this.onAction});

  final IconData icon;
  final String text;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Space.xxl, horizontal: Space.xl),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(color: Palette.brandSubtle, shape: BoxShape.circle),
            child: Icon(icon, color: Palette.brand, size: 28),
          ),
          const SizedBox(height: Space.lg),
          Text(text, style: theme.textTheme.titleMedium, textAlign: TextAlign.center),
          if (action != null) ...[
            const SizedBox(height: Space.lg),
            SizedBox(width: 200, child: FilledButton(onPressed: onAction, child: Text(action!))),
          ],
        ],
      ),
    );
  }
}

/// A failed load: what happened in two words, and Retry.
class ErrorState extends StatelessWidget {
  const ErrorState({super.key, required this.error, required this.onRetry});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final kind = error is ApiException ? (error as ApiException).kind : ApiFailure.server;
    final (icon, text) = switch (kind) {
      ApiFailure.offline => (PhosphorIconsRegular.wifiSlash, s.offline.split('·').first.trim()),
      ApiFailure.slow => (PhosphorIconsRegular.clock, s.slowConnection),
      _ => (PhosphorIconsRegular.warningCircle, s.somethingWrong),
    };
    return EmptyState(icon: icon, text: text, action: s.retry, onAction: onRetry);
  }
}

/// A thin grey bar: showing the saved copy because there is no connection.
class OfflineBar extends StatelessWidget {
  const OfflineBar({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: Palette.hairline,
      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: Space.lg),
      child: Row(
        children: [
          Icon(PhosphorIconsRegular.wifiSlash, size: 16, color: Palette.muted),
          const SizedBox(width: Space.sm),
          Text(S.of(context).offline, style: Theme.of(context).textTheme.labelMedium),
        ],
      ),
    );
  }
}

/// Primary button that turns into three pulsing dots while [onPressed] runs, then a tick.
class LoadingButton extends StatefulWidget {
  const LoadingButton({super.key, required this.label, required this.onPressed, this.danger = false});

  final String label;
  final Future<bool> Function()? onPressed;
  final bool danger;

  @override
  State<LoadingButton> createState() => _LoadingButtonState();
}

enum _ButtonState { idle, busy, done }

class _LoadingButtonState extends State<LoadingButton> {
  _ButtonState _state = _ButtonState.idle;

  Future<void> _run() async {
    if (_state != _ButtonState.idle || widget.onPressed == null) return;
    HapticFeedback.selectionClick();
    setState(() => _state = _ButtonState.busy);
    var ok = false;
    try {
      ok = await widget.onPressed!();
    } finally {
      if (mounted) setState(() => _state = ok ? _ButtonState.done : _ButtonState.idle);
    }
    if (ok) {
      HapticFeedback.lightImpact();
      await Future<void>.delayed(const Duration(milliseconds: 600));
      if (mounted) setState(() => _state = _ButtonState.idle);
    }
  }

  @override
  Widget build(BuildContext context) {
    final child = switch (_state) {
      _ButtonState.idle => Text(widget.label, key: const ValueKey('label')),
      _ButtonState.busy => const LoadingDots(key: ValueKey('dots')),
      _ButtonState.done => const Icon(PhosphorIconsBold.check, key: ValueKey('done'), size: 22),
    };
    return FilledButton(
      style: widget.danger ? FilledButton.styleFrom(backgroundColor: Palette.danger, foregroundColor: Palette.onDanger) : null,
      onPressed: widget.onPressed == null ? null : _run,
      child: AnimatedSwitcher(duration: const Duration(milliseconds: 180), child: child),
    );
  }
}

/// Three pulsing dots (busy buttons, the assistant typing).
class LoadingDots extends StatefulWidget {
  const LoadingDots({super.key});

  @override
  State<LoadingDots> createState() => _DotsState();
}

class _DotsState extends State<LoadingDots> with SingleTickerProviderStateMixin {
  // Made in initState, not lazily: the still version never touches it, and dispose must not
  // create one.
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = DefaultTextStyle.of(context).style.color ?? Colors.white;
    if (Motion.off(context)) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < 3; i++)
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: 7,
              height: 7,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
        ],
      );
    }
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < 3; i++)
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: 7,
              height: 7,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.35 + 0.65 * _pulse((_c.value - i * 0.18) % 1)),
                shape: BoxShape.circle,
              ),
            ),
        ],
      ),
    );
  }

  double _pulse(double t) => t < 0.5 ? t * 2 : (1 - t) * 2;
}

/// A breathing green dot next to live numbers.
class LiveDot extends StatefulWidget {
  const LiveDot({super.key, this.color});

  /// The band's accent when null.
  final Color? color;

  @override
  State<LiveDot> createState() => _LiveDotState();
}

class _LiveDotState extends State<LiveDot> with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1600))..repeat(reverse: true);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
        opacity: Motion.off(context) ? kAlwaysCompleteAnimation : Tween<double>(begin: 0.35, end: 1).animate(_c),
        child: Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: widget.color ?? Palette.onForestAccent, shape: BoxShape.circle),
        ),
      );
}

/// The one status pill: open, busy, closed, emergency, a waiting count. Always a word, never
/// colour alone. [onImage] gives it a white back for use over a drawing or a map.
class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.text, this.tone = PillTone.brand, this.icon, this.dot = false, this.onImage = false});

  /// Open now / closed.
  factory StatusPill.open({Key? key, required bool open, required String text, bool onImage = false}) =>
      StatusPill(key: key, text: text, tone: open ? PillTone.brand : PillTone.muted, dot: true, onImage: onImage);

  final String text;
  final PillTone tone;
  final IconData? icon;
  final bool dot;
  final bool onImage;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (tone) {
      PillTone.brand => (Palette.brandSubtle, Palette.brand),
      PillTone.ochre => (Palette.ochreSubtle, Palette.ochreText),
      PillTone.danger => (Palette.dangerSubtle, Palette.danger),
      PillTone.muted => (Palette.skeleton, Palette.muted),
    };
    final ink = onImage && tone == PillTone.brand ? Palette.forestInk : fg;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: onImage ? Palette.surface : bg,
        borderRadius: BorderRadius.circular(Space.pill),
        boxShadow: onImage ? Shadows.card : null,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dot) ...[
            Container(width: 7, height: 7, decoration: BoxDecoration(color: fg, shape: BoxShape.circle)),
            const SizedBox(width: 6),
          ] else if (icon != null) ...[
            Icon(icon, size: 14, color: fg),
            const SizedBox(width: 4),
          ],
          Flexible(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(color: ink).tabular,
            ),
          ),
        ],
      ),
    );
  }
}

/// brand: open, verified · ochre: busy, waiting · danger: emergency · muted: closed.
enum PillTone { brand, ochre, danger, muted }

/// Ask before something that cannot be undone (red, upgrade 15 §3).
Future<bool> confirmDanger(BuildContext context, {required String title, required String action}) async {
  final s = S.of(context);
  final ok = await showModalBottomSheet<bool>(
    context: context,
    builder: (context) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Space.xl, 0, Space.xl, Space.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge, textAlign: TextAlign.center),
            const SizedBox(height: Space.xl),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Palette.danger),
              onPressed: () => Navigator.pop(context, true),
              child: Text(action),
            ),
            const SizedBox(height: Space.sm),
            OutlinedButton(onPressed: () => Navigator.pop(context, false), child: Text(s.keep)),
          ],
        ),
      ),
    ),
  );
  return ok ?? false;
}
