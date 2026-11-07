import 'package:flutter/material.dart';

import '../app/theme.dart';
import 'heartbeat_refresh.dart';

/// A sub-page (Profile, Family, settings, records…): a light header with a large title that
/// collapses into a standard bar on scroll. No dark band; the bands belong to the main tabs.
/// The large title may wrap (long Kinyarwanda or French words, large text); the bar shows the
/// title on one line once the large one has scrolled away.
class SubPage extends StatefulWidget {
  const SubPage({
    super.key,
    required this.title,
    this.children,
    this.slivers,
    this.padding = const EdgeInsets.fromLTRB(Space.lg, Space.sm, Space.lg, Space.xxl),
    this.actions,
    this.bottomBar,
    this.onRefresh,
    this.busy = false,
    this.backgroundColor = Palette.page,
  }) : assert(children != null || slivers != null);

  final String title;

  /// The page content as a padded list…
  final List<Widget>? children;

  /// …or as slivers, after the header.
  final List<Widget>? slivers;
  final EdgeInsetsGeometry padding;
  final List<Widget>? actions;

  /// Usually a [BottomActionBar].
  final Widget? bottomBar;
  final RefreshCallback? onRefresh;

  /// A thin progress line under the bar (saving).
  final bool busy;
  final Color backgroundColor;

  @override
  State<SubPage> createState() => _SubPageState();
}

class _SubPageState extends State<SubPage> {
  final _collapsed = ValueNotifier(false);

  @override
  void dispose() {
    _collapsed.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scroll = NotificationListener<ScrollUpdateNotification>(
      onNotification: (n) {
        if (n.depth == 0) _collapsed.value = n.metrics.pixels > Space.lg + context.scaled(24);
        return false;
      },
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverAppBar(
            pinned: true,
            actions: widget.actions,
            title: ValueListenableBuilder<bool>(
              valueListenable: _collapsed,
              builder: (context, collapsed, child) => AnimatedOpacity(
                opacity: collapsed ? 1 : 0,
                duration: Motion.of(context, Motion.fast),
                child: child,
              ),
              child: Text(widget.title, maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
            bottom: widget.busy
                ? const PreferredSize(preferredSize: Size.fromHeight(2), child: LinearProgressIndicator(minHeight: 2))
                : null,
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(Space.lg, Space.xs, Space.lg, Space.lg),
              child: Semantics(
                header: true,
                child: Text(widget.title, style: theme.textTheme.headlineMedium),
              ),
            ),
          ),
          if (widget.children != null)
            SliverPadding(padding: widget.padding, sliver: SliverList.list(children: widget.children!)),
          ...?widget.slivers,
        ],
      ),
    );
    return Scaffold(
      backgroundColor: widget.backgroundColor,
      body: widget.onRefresh == null ? scroll : HeartbeatRefresh(onRefresh: widget.onRefresh!, child: scroll),
      bottomNavigationBar: widget.bottomBar,
    );
  }
}
