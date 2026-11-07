import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../ui/icons.dart';

import '../app/strings.dart';
import '../app/theme.dart';
import '../data/providers.dart';

/// Four tabs at the bottom (upgrade 15 §1); a navigation rail on tablets.
/// Android back: up inside the tab, then to Home, then out of the app.
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  void _go(int index) => shell.goBranch(index, initialLocation: index == shell.currentIndex);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final hasTicket = ref.watch(activeVisitsProvider).value?.data.isNotEmpty ?? false;
    final items = [
      (s.home, PhosphorIconsRegular.house, PhosphorIconsFill.house, false),
      (s.care, PhosphorIconsRegular.firstAidKit, PhosphorIconsFill.firstAidKit, false),
      (s.visits, PhosphorIconsRegular.ticket, PhosphorIconsFill.ticket, hasTicket),
      (s.me, PhosphorIconsRegular.userCircle, PhosphorIconsFill.userCircle, false),
    ];
    Widget icon(IconData data, bool dot) => Badge(
          isLabelVisible: dot,
          smallSize: 8,
          backgroundColor: Palette.brand,
          child: Icon(data),
        );

    final Widget body;
    if (MediaQuery.sizeOf(context).width >= 720) {
      body = Scaffold(
        body: Row(
          children: [
            NavigationRail(
              selectedIndex: shell.currentIndex,
              onDestinationSelected: _go,
              labelType: NavigationRailLabelType.all,
              indicatorColor: Palette.brandSubtle,
              destinations: [
                for (final (label, off, on, dot) in items)
                  NavigationRailDestination(
                    icon: icon(off, dot),
                    selectedIcon: icon(on, dot),
                    label: Text(label),
                  ),
              ],
            ),
            const VerticalDivider(),
            Expanded(child: shell),
          ],
        ),
      );
    } else {
      body = Scaffold(
        body: shell,
        bottomNavigationBar: DecoratedBox(
          decoration: const BoxDecoration(border: Border(top: BorderSide(color: Palette.hairline))),
          child: NavigationBar(
            selectedIndex: shell.currentIndex,
            onDestinationSelected: _go,
            destinations: [
              for (final (label, off, on, dot) in items)
                NavigationDestination(
                  icon: icon(off, dot),
                  selectedIcon: icon(on, dot).withColor(Palette.brand),
                  label: label,
                ),
            ],
          ),
        ),
      );
    }
    // Reached only when the tab has nothing left to go back to: another tab returns to Home.
    return PopScope(
      canPop: shell.currentIndex == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) shell.goBranch(0);
      },
      child: body,
    );
  }
}

extension on Widget {
  Widget withColor(Color color) => IconTheme.merge(data: IconThemeData(color: color), child: this);
}

/// Keeps every tab alive (each keeps its page and scroll position) and fades the chosen tab in
/// (200 ms), no sideways slide. Hidden tabs are offstage, so a tab can never stay painted over
/// another one.
class FadeThroughBranches extends StatefulWidget {
  const FadeThroughBranches({super.key, required this.index, required this.children});

  final int index;
  final List<Widget> children;

  @override
  State<FadeThroughBranches> createState() => _FadeThroughBranchesState();
}

class _FadeThroughBranchesState extends State<FadeThroughBranches> with SingleTickerProviderStateMixin {
  late final AnimationController _fade =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 200), value: 1);
  late final Animation<double> _curve = CurvedAnimation(parent: _fade, curve: Curves.easeOut);
  late final Animation<double> _scale = Tween<double>(begin: 0.985, end: 1).animate(_curve);

  @override
  void didUpdateWidget(FadeThroughBranches oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.index != widget.index) {
      // Tabs fade through; no motion when the system asks for none.
      Motion.off(context) ? _fade.value = 1 : _fade.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _fade.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        // The same widget structure for every tab, so switching never rebuilds a tab's pages.
        for (var i = 0; i < widget.children.length; i++)
          Offstage(
            offstage: i != widget.index,
            child: TickerMode(
              enabled: i == widget.index,
              child: FadeTransition(
                opacity: i == widget.index ? _curve : kAlwaysCompleteAnimation,
                child: ScaleTransition(
                  scale: i == widget.index ? _scale : const AlwaysStoppedAnimation<double>(1),
                  child: widget.children[i],
                ),
              ),
            ),
          ),
      ],
    );
  }
}
