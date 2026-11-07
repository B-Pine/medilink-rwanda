import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app/theme.dart';
import 'icons.dart';

/// The screen's main action, fixed at the bottom: white, a hairline on top, inside the safe
/// area, full width. [note] says why the action is not available yet.
class BottomActionBar extends StatelessWidget {
  const BottomActionBar({super.key, required this.child, this.note});

  final Widget child;
  final String? note;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: const BoxDecoration(
          color: Palette.surface,
          border: Border(top: BorderSide(color: Palette.hairline)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(Space.lg, Space.md, Space.lg, Space.md),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (note != null) ...[
                  Text(note!, style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
                  const SizedBox(height: Space.sm),
                ],
                child,
              ],
            ),
          ),
        ),
      );
}

/// Two to four options in one row. It never wraps: the options share the width and, when the
/// words do not fit, the row scrolls sideways.
class SegmentedControl<T> extends StatelessWidget {
  const SegmentedControl({super.key, required this.options, required this.value, required this.onChanged});

  final List<(T, String)> options;
  final T value;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.titleSmall;
    final scaler = MediaQuery.textScalerOf(context);
    final direction = Directionality.of(context);
    final duration = Motion.of(context, Motion.fast);

    // Each option's natural width: its words plus padding.
    double measure(String label) {
      final painter = TextPainter(
        text: TextSpan(text: label, style: style),
        textDirection: direction,
        textScaler: scaler,
        maxLines: 1,
      )..layout();
      final width = painter.width.ceilToDouble();
      painter.dispose();
      return width + 2;
    }

    final words = [for (final (_, label) in options) measure(label)];
    Widget segment(T option, String label, double padding) => Semantics(
          button: true,
          selected: option == value,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () {
              if (option == value) return;
              HapticFeedback.selectionClick();
              onChanged(option);
            },
            child: AnimatedContainer(
              duration: duration,
              curve: Motion.ease,
              constraints: const BoxConstraints(minHeight: 40),
              alignment: Alignment.center,
              padding: EdgeInsets.symmetric(horizontal: padding),
              decoration: BoxDecoration(
                color: option == value ? Palette.brand : Colors.transparent,
                borderRadius: BorderRadius.circular(Space.radiusSm),
              ),
              child: Text(
                label,
                maxLines: 1,
                softWrap: false,
                style: style?.copyWith(color: option == value ? Colors.white : Palette.ink),
              ),
            ),
          ),
        );

    return LayoutBuilder(builder: (context, box) {
      final inner = box.maxWidth - 2 * Space.xs - 2;
      final widest = words.fold<double>(0, (a, b) => a > b ? a : b) + 2 * Space.md;
      double total(double padding) => words.fold<double>(0, (a, b) => a + b + 2 * padding);
      // Roomy padding when it fits, tighter padding before resorting to scrolling.
      final padding = total(Space.md) <= inner ? Space.md : Space.sm;
      final fits = total(padding) <= inner;
      final Widget row;
      if (widest * options.length <= inner) {
        // Equal segments.
        row = Row(children: [for (final (option, label) in options) Expanded(child: segment(option, label, Space.md))]);
      } else if (fits) {
        // Each as wide as its words, sharing what is left.
        row = Row(
          children: [
            for (final (i, (option, label)) in options.indexed)
              Expanded(flex: (words[i] + 2 * padding).round(), child: segment(option, label, padding)),
          ],
        );
      } else {
        // Too long for one row: it scrolls sideways, never wraps.
        row = Row(
          mainAxisSize: MainAxisSize.min,
          children: [for (final (option, label) in options) segment(option, label, padding)],
        );
      }
      final track = Container(
        padding: const EdgeInsets.all(Space.xs),
        decoration: BoxDecoration(
          color: Palette.surface,
          borderRadius: BorderRadius.circular(Space.radius),
          border: Border.all(color: Palette.hairline),
        ),
        child: row,
      );
      return fits ? track : SingleChildScrollView(scrollDirection: Axis.horizontal, child: track);
    });
  }
}

/// A tap target that looks like a text field (a date, a time): label and value on the left, an
/// icon on the right.
class FieldButton extends StatelessWidget {
  const FieldButton({super.key, required this.label, required this.value, required this.onTap, this.icon = PhosphorIconsRegular.calendarBlank});

  final String label;
  final String? value;
  final VoidCallback? onTap;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: label,
        value: value,
        child: InkWell(
          borderRadius: BorderRadius.circular(Space.radius),
          onTap: onTap,
          child: InputDecorator(
            isEmpty: value == null || value!.isEmpty,
            decoration: InputDecoration(labelText: label, suffixIcon: Icon(icon, size: 22)),
            child: Text(value ?? '', style: Theme.of(context).textTheme.bodyLarge, maxLines: 1),
          ),
        ),
      );
}

/// A live value (people ahead, a wait) that rolls up into place when it changes, like a
/// counter. Swaps without motion when animations are off.
class Rolling extends StatelessWidget {
  const Rolling({super.key, required this.value, required this.child});

  /// What identifies the shown value; a change starts the roll.
  final Object value;
  final Widget child;

  @override
  Widget build(BuildContext context) => AnimatedSwitcher(
        duration: Motion.of(context, Motion.slow),
        switchInCurve: Motion.ease,
        switchOutCurve: Curves.easeIn,
        transitionBuilder: (child, animation) => ClipRect(
          child: SlideTransition(
            position: Tween(begin: const Offset(0, 0.6), end: Offset.zero).animate(animation),
            child: FadeTransition(opacity: animation, child: child),
          ),
        ),
        child: KeyedSubtree(key: ValueKey(value), child: child),
      );
}

/// The bar title of a detail page (doctor, facility): hidden while the header shows the name,
/// shown once the header has collapsed into the bar.
class CollapsedTitle extends StatelessWidget {
  const CollapsedTitle(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final settings = context.dependOnInheritedWidgetOfExactType<FlexibleSpaceBarSettings>();
    final collapsed = settings == null || settings.currentExtent <= settings.minExtent + 24;
    return AnimatedOpacity(
      opacity: collapsed ? 1 : 0,
      duration: Motion.of(context, Motion.fast),
      child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis),
    );
  }
}

/// A round white back button for screens with a picture or a band behind the bar.
class HeaderBackButton extends StatelessWidget {
  const HeaderBackButton({super.key, this.onTap});

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Center(
        child: SizedBox(
          width: 48,
          height: 48,
          child: Material(
            type: MaterialType.transparency,
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: onTap ?? () => Navigator.of(context).maybePop(),
              child: Center(
                child: Container(
                  width: 40,
                  height: 40,
                  decoration: const BoxDecoration(color: Palette.surface, shape: BoxShape.circle),
                  child: Icon(
                    PhosphorIconsRegular.arrowLeft,
                    color: Palette.ink,
                    size: 22,
                    semanticLabel: MaterialLocalizations.of(context).backButtonTooltip,
                  ),
                ),
              ),
            ),
          ),
        ),
      );
}
