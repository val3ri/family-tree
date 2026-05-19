import {
  Component, OnInit, OnDestroy, AfterViewInit, ElementRef, ViewChild,
  Output, EventEmitter, Input, OnChanges, SimpleChanges, NgZone
} from '@angular/core';
import { Subscription } from 'rxjs';
import * as d3 from 'd3';
import { GraphData, GraphNode, GraphEdge } from '../../models/relation.model';
import { ThemeService } from '../../services/theme.service';

const RELATION_COLORS: Record<string, string> = {
  PARENT_CHILD: '#4A90D9',
  SPOUSE: '#E05C5C',
  SIBLING: '#4CAF50',
};

export const GEN_RANGES = [
  { name: 'Transcendental',      from: 1792, to: 1821, order: 0  },
  { name: 'Gilded',              from: 1822, to: 1842, order: 1  },
  { name: 'Progressive',         from: 1843, to: 1859, order: 2  },
  { name: 'Missionary',          from: 1860, to: 1882, order: 3  },
  { name: 'Lost Generation',     from: 1883, to: 1900, order: 4  },
  { name: 'Greatest (GI)',       from: 1901, to: 1927, order: 5  },
  { name: 'Silent Generation',   from: 1928, to: 1945, order: 6  },
  { name: 'Baby Boomers',        from: 1946, to: 1964, order: 7  },
  { name: 'Generation X',        from: 1965, to: 1980, order: 8  },
  { name: 'Millennials (Gen Y)', from: 1981, to: 1996, order: 9  },
  { name: 'Generation Z',        from: 1997, to: 2012, order: 10 },
  { name: 'Generation Alpha',    from: 2010, to: 2024, order: 11 },
  { name: 'Generation Beta',     from: 2025, to: 2039, order: 12 },
];

const GEN_HINT_ORDER: Record<number, number> = Object.fromEntries(GEN_RANGES.map(g => [g.from, g.order]));

const NODE_RADIUS = 40;
const FOCUSED_RADIUS = 52;
const MARRIAGE_NODE_RADIUS = 6;

function parentChildPath(x1: number, y1: number, x2: number, y2: number): string {
  const my = (y1 + y2) / 2;
  return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
}

function spousePath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return `M${x1},${y1} L${mx},${my} L${x2},${y2}`;
}

function siblingPath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  const cy = Math.min(y1, y2) - 50;
  return `M${x1},${y1} C${x1},${cy} ${x2},${cy} ${x2},${y2}`;
}

interface MarriageNode {
  id: string;
  x: number;
  y: number;
  spouseAId: string;
  spouseBId: string;
}

@Component({
  selector: 'app-tree',
  standalone: true,
  template: `<svg #svg style="width:100%;height:100%;display:block;"></svg>`,
  styles: [`:host { display: block; width: 100%; height: 100%; overflow: hidden; }`]
})
export class TreeComponent implements OnInit, AfterViewInit, OnDestroy, OnChanges {
  @ViewChild('svg', { static: true }) svgRef!: ElementRef<SVGElement>;
  @Input() graphData!: GraphData;
  @Input() focusedId: string | null = null;
  @Input() selectedId: string | null = null;
  @Output() nodeClicked = new EventEmitter<string>();

  private svg!: d3.Selection<SVGElement, unknown, null, undefined>;
  private g!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private gLabels!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private zoom!: d3.ZoomBehavior<SVGElement, unknown>;
  private simulation?: d3.Simulation<GraphNode, undefined>;
  private liveNodes: GraphNode[] = [];
  private liveMarriageNodes: MarriageNode[] = [];
  private genMap = new Map<string, number>();
  private readonly Y_GAP = 140;
  private themeSub?: Subscription;

  constructor(private zone: NgZone, private themeService: ThemeService) {}

  ngOnInit(): void {
    this.zone.runOutsideAngular(() => this.initSvg());
    this.themeSub = this.themeService.themeChanged$.subscribe(() => {
      this.zone.runOutsideAngular(() => {
        const gridLine = getComputedStyle(document.body).getPropertyValue('--grid-line').trim() || '#d0d8e8';
        this.svg.select('defs pattern path').attr('stroke', gridLine);
        if (this.graphData?.nodes?.length) this.render();
      });
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      if (this.graphData?.nodes?.length) {
        this.zone.runOutsideAngular(() => this.render());
      }
    }, 0);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.g) return;
    if (changes['graphData']) {
      const isRefocus = !changes['graphData'].firstChange;
      if (isRefocus) {
        this.zone.runOutsideAngular(() => {
          this.g.transition().duration(250).style('opacity', 0).on('end', () => {
            this.render();
            this.g.style('opacity', 0).transition().duration(350).style('opacity', 1);
          });
        });
      } else {
        this.zone.runOutsideAngular(() => this.render());
      }
    } else if (changes['focusedId']) {
      this.zone.runOutsideAngular(() => this.updateFocusedStyles());
    }
    if (changes['selectedId']) {
      this.zone.runOutsideAngular(() => this.applyHighlight());
    }
  }

  ngOnDestroy(): void {
    this.simulation?.stop();
    this.svg?.on('.zoom', null);
    this.themeSub?.unsubscribe();
  }

  private initSvg(): void {
    const el = this.svgRef.nativeElement;
    this.svg = d3.select(el);

    const cssVars = getComputedStyle(document.body);
    const gridLine = cssVars.getPropertyValue('--grid-line').trim() || '#d0d8e8';

    const defs = this.svg.append('defs');
    const pattern = defs.append('pattern')
      .attr('id', 'grid-pattern')
      .attr('width', 40).attr('height', 40)
      .attr('patternUnits', 'userSpaceOnUse');
    pattern.append('path')
      .attr('d', 'M 40 0 L 0 0 0 40')
      .attr('fill', 'none')
      .attr('stroke', gridLine)
      .attr('stroke-width', 0.5);
    this.svg.append('rect')
      .attr('class', 'bg-rect')
      .attr('width', '100%').attr('height', '100%')
      .attr('fill', 'url(#grid-pattern)');

    this.zoom = d3.zoom<SVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .filter(event => !event.button)
      .on('zoom', (event) => {
        this.g.attr('transform', event.transform);
        this.gLabels.attr('transform', `translate(0,${event.transform.y}) scale(${event.transform.k})`);
      });

    this.svg.call(this.zoom);
    this.g = this.svg.append('g');
    this.gLabels = this.svg.append('g').attr('class', 'gen-labels-g');
  }

  private render(): void {
    this.simulation?.stop();
    this.g.selectAll('*').remove();
    if (!this.graphData?.nodes?.length) return;

    const cssVars = getComputedStyle(document.body);
    const gridLine = cssVars.getPropertyValue('--grid-line').trim() || '#d0d8e8';
    this.svg.select('defs pattern path').attr('stroke', gridLine);

    const { nodes, edges, marriageNodes, genMap } = this.buildLayout();
    this.liveNodes = nodes;
    this.liveMarriageNodes = marriageNodes;
    this.genMap = genMap;

    this.drawEdges(edges, nodes, marriageNodes);
    this.drawMarriageNodes(marriageNodes);
    this.drawNodes(nodes, edges);

    this.runSimulation(nodes, edges, genMap, marriageNodes);
    this.updateGenLabels();
    if (this.selectedId) this.applyHighlight();
  }

  // ── Reingold-Tilford layout ────────────────────────────────────────────────
  //
  // Виртуално дърво: всяка двойка (SPOUSE edge) → couple node (виртуален родител).
  // Couple node заема X_GAP ширина (ляв = person_a, десен = person_b).
  // Ghost nodes и техните съпрузи се позиционират отделно накрая.
  //
  // Фаза 1 (bottom-up): изчисляване на relative X чрез contour merging.
  // Фаза 2 (top-down):  конвертиране в абсолютни координати.
  private buildLayout(): { nodes: GraphNode[], edges: GraphEdge[], marriageNodes: MarriageNode[], genMap: Map<string, number> } {
    const nodes = this.graphData.nodes.map(n => ({ ...n }));
    const edges = this.graphData.edges;
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    const X_GAP = 120;
    const yGap = this.Y_GAP;

    const spouseEdges  = edges.filter(e => e.relation_type === 'SPOUSE');
    const pcEdges      = edges.filter(e => e.relation_type === 'PARENT_CHILD');
    const siblingEdges = edges.filter(e => e.relation_type === 'SIBLING');

    // ── Генерационни нива (BFS + birth year) ────────────────────────────────

    const getGenOrder = (n: GraphNode): number | null => {
      if (n.birth_date) {
        const yr = new Date(n.birth_date).getFullYear();
        return GEN_RANGES.find(g => yr >= g.from && yr <= g.to)?.order ?? null;
      }
      if (n.generation_hint) return GEN_HINT_ORDER[n.generation_hint] ?? null;
      return null;
    };

    const bfsMap = new Map<string, number>();
    const childIdsSet = new Set(pcEdges.map(e => e.person_b_id));
    const bfsRoots = nodes.filter(n => !childIdsSet.has(n.id));
    const bfsQueue: { id: string; gen: number }[] = bfsRoots.map(r => ({ id: r.id, gen: 0 }));
    while (bfsQueue.length) {
      const { id, gen } = bfsQueue.shift()!;
      const cur = bfsMap.get(id);
      if (cur !== undefined && cur >= gen) continue;
      bfsMap.set(id, gen);
      pcEdges.filter(e => e.person_a_id === id)
        .forEach(e => bfsQueue.push({ id: e.person_b_id, gen: gen + 1 }));
    }
    nodes.forEach(n => { if (!bfsMap.has(n.id)) bfsMap.set(n.id, 0); });

    const genMap = new Map<string, number>();
    const nodesWithOrder = nodes.filter(n => getGenOrder(n) !== null);
    let bfsToGenOffset = 0;
    if (nodesWithOrder.length > 0) {
      const ref = nodesWithOrder[0];
      bfsToGenOffset = (getGenOrder(ref) ?? 0) - (bfsMap.get(ref.id) ?? 0);
    }
    nodes.forEach(n => {
      const order = getGenOrder(n);
      genMap.set(n.id, order !== null ? order : (bfsMap.get(n.id) ?? 0) + bfsToGenOffset);
    });

    const usedSlots = Array.from(new Set(genMap.values())).sort((a, b) => a - b);
    const slotRemap = new Map(usedSlots.map((s, i) => [s, i]));
    genMap.forEach((s, id) => genMap.set(id, slotRemap.get(s)!));

    // ── Ghost nodes ──────────────────────────────────────────────────────────

    const ghostIds = new Set(nodes.filter(n => n.ghost).map(n => n.id));
    const ghostSpouseIds = new Set<string>();
    ghostIds.forEach(gid => {
      spouseEdges.forEach(e => {
        if (e.person_a_id === gid) ghostSpouseIds.add(e.person_b_id);
        if (e.person_b_id === gid) ghostSpouseIds.add(e.person_a_id);
      });
    });
    const excluded = new Set([...ghostIds, ...ghostSpouseIds]);

    // ── Couple units ─────────────────────────────────────────────────────────

    interface CoupleUnit { id: string; aId: string; bId: string; }
    const coupleUnits: CoupleUnit[] = [];
    const coupleByPerson = new Map<string, CoupleUnit>();

    spouseEdges.forEach(e => {
      if (excluded.has(e.person_a_id) || excluded.has(e.person_b_id)) return;
      const cu: CoupleUnit = { id: `couple:${e.id}`, aId: e.person_a_id, bId: e.person_b_id };
      coupleUnits.push(cu);
      if (!coupleByPerson.has(e.person_a_id)) coupleByPerson.set(e.person_a_id, cu);
      if (!coupleByPerson.has(e.person_b_id)) coupleByPerson.set(e.person_b_id, cu);
    });

    // ── Helpers ──────────────────────────────────────────────────────────────

    const getParentCouple = (id: string): CoupleUnit | null => {
      for (const e of pcEdges.filter(e2 => e2.person_b_id === id)) {
        const cu = coupleByPerson.get(e.person_a_id);
        if (cu) return cu;
      }
      return null;
    };

    const getCoupleChildren = (cu: CoupleUnit): string[] => {
      const s = new Set<string>();
      pcEdges.forEach(e => {
        if ((e.person_a_id === cu.aId || e.person_a_id === cu.bId) && !excluded.has(e.person_b_id))
          s.add(e.person_b_id);
      });
      return [...s];
    };

    const getSingleChildren = (pid: string): string[] =>
      pcEdges.filter(e => e.person_a_id === pid && !excluded.has(e.person_b_id)).map(e => e.person_b_id);

    // ── Генерационен grid алгоритъм ──────────────────────────────────────────
    //
    // Единица за наредба = "slot": двойка (couple unit) или сам човек.
    // Фазата е bottom-up: децата се наредят първо, после родителите се центрират.

    const xSlot = new Map<string, number>();

    interface GridUnit { isCouple: boolean; coupleId?: string; personId?: string; }
    const getGridUnitId = (gu: GridUnit) => gu.isCouple ? gu.coupleId! : gu.personId!;

    const allMainNodes = nodes.filter(n => !excluded.has(n.id));
    const isChild = new Set(pcEdges.filter(e => !excluded.has(e.person_b_id)).map(e => e.person_b_id));

    const allGridUnits: GridUnit[] = [];
    const seenCouplesMain = new Set<string>();
    allMainNodes.forEach(n => {
      const cu = coupleByPerson.get(n.id);
      if (cu) {
        if (!seenCouplesMain.has(cu.id)) { seenCouplesMain.add(cu.id); allGridUnits.push({ isCouple: true, coupleId: cu.id }); }
      } else {
        allGridUnits.push({ isCouple: false, personId: n.id });
      }
    });

    const rootUnits = allGridUnits.filter(gu => {
      if (gu.isCouple) {
        const cu = coupleUnits.find(c => c.id === gu.coupleId)!;
        return !isChild.has(cu.aId) && !isChild.has(cu.bId);
      }
      return !isChild.has(gu.personId!);
    });

    let cursor = 0;
    const placed = new Set<string>();
    const placing = new Set<string>(); // cycle guard

    const placeUnit = (gu: GridUnit): { left: number; right: number } => {
      const uid = getGridUnitId(gu);
      if (placing.has(uid)) return { left: cursor, right: cursor };
      placing.add(uid);

      if (gu.isCouple) {
        const cu = coupleUnits.find(c => c.id === gu.coupleId)!;
        if (placed.has(cu.aId)) {
          placing.delete(uid);
          return { left: xSlot.get(cu.aId)!, right: xSlot.get(cu.bId)! };
        }

        const childIds = getCoupleChildren(cu);
        const childUnits: GridUnit[] = [];
        const seenChild = new Set<string>();
        childIds.forEach(cid => {
          const childCu = getParentCouple(cid);
          if (childCu) {
            if (!seenChild.has(childCu.id)) { seenChild.add(childCu.id); childUnits.push({ isCouple: true, coupleId: childCu.id }); }
          } else {
            if (!seenChild.has(cid)) { seenChild.add(cid); childUnits.push({ isCouple: false, personId: cid }); }
          }
        });

        let childLeft = Infinity, childRight = -Infinity;
        childUnits.forEach(cu2 => {
          const r = placeUnit(cu2);
          childLeft  = Math.min(childLeft,  r.left);
          childRight = Math.max(childRight, r.right);
        });

        let ax: number, bx: number;
        if (childUnits.length > 0) {
          const mid = (childLeft + childRight) / 2;
          ax = mid - X_GAP / 2;
          bx = mid + X_GAP / 2;
          if (ax < cursor) { const shift = cursor - ax; ax += shift; bx += shift; }
        } else {
          ax = cursor;
          bx = cursor + X_GAP;
        }

        xSlot.set(cu.aId, ax);
        xSlot.set(cu.bId, bx);
        placed.add(cu.aId);
        placed.add(cu.bId);
        cursor = Math.max(cursor, bx + X_GAP);
        placing.delete(uid);
        return { left: ax, right: bx };

      } else {
        const pid = gu.personId!;
        if (placed.has(pid)) {
          placing.delete(uid);
          return { left: xSlot.get(pid)!, right: xSlot.get(pid)! };
        }

        const childIds = getSingleChildren(pid);
        const childUnits: GridUnit[] = [];
        const seenChild = new Set<string>();
        childIds.forEach(cid => {
          const childCu = getParentCouple(cid);
          if (childCu) {
            if (!seenChild.has(childCu.id)) { seenChild.add(childCu.id); childUnits.push({ isCouple: true, coupleId: childCu.id }); }
          } else {
            if (!seenChild.has(cid)) { seenChild.add(cid); childUnits.push({ isCouple: false, personId: cid }); }
          }
        });

        let childLeft = Infinity, childRight = -Infinity;
        childUnits.forEach(cu2 => {
          const r = placeUnit(cu2);
          childLeft  = Math.min(childLeft,  r.left);
          childRight = Math.max(childRight, r.right);
        });

        let px: number;
        if (childUnits.length > 0) {
          px = (childLeft + childRight) / 2;
          if (px < cursor) px = cursor;
        } else {
          px = cursor;
        }

        xSlot.set(pid, px);
        placed.add(pid);
        cursor = Math.max(cursor, px + X_GAP);
        placing.delete(uid);
        return { left: px, right: px };
      }
    };

    rootUnits.forEach(gu => placeUnit(gu));

    // Place remaining unplaced nodes
    allGridUnits.forEach(gu => {
      if (gu.isCouple) {
        const cu = coupleUnits.find(c => c.id === gu.coupleId)!;
        if (!placed.has(cu.aId)) {
          xSlot.set(cu.aId, cursor); xSlot.set(cu.bId, cursor + X_GAP);
          placed.add(cu.aId); placed.add(cu.bId);
          cursor += X_GAP * 2;
        }
      } else {
        const pid = gu.personId!;
        if (!placed.has(pid)) { xSlot.set(pid, cursor); placed.add(pid); cursor += X_GAP; }
      }
    });

    // Center around 0
    const allX = [...xSlot.values()];
    const midX = allX.length ? (Math.min(...allX) + Math.max(...allX)) / 2 : 0;

    nodes.filter(n => !excluded.has(n.id)).forEach(n => {
      n.x = (xSlot.get(n.id) ?? 0) - midX;
      n.y = (genMap.get(n.id) ?? 0) * yGap;
    });

    // ── Ghost nodes ───────────────────────────────────────────────────────────

    type GhostInfo = { node: GraphNode; anchorX: number; anchorY: number; direction: 1 | -1 };
    const ghostInfos: GhostInfo[] = [];

    nodes.filter(n => n.ghost).forEach(n => {
      const sibEdge = siblingEdges.find(e => e.person_a_id === n.id || e.person_b_id === n.id);
      if (sibEdge) {
        const sibId = sibEdge.person_a_id === n.id ? sibEdge.person_b_id : sibEdge.person_a_id;
        const sib = nodeMap.get(sibId);
        if (sib) {
          const spEdge = spouseEdges.find(e => e.person_a_id === sibId || e.person_b_id === sibId);
          let direction: 1 | -1 = -1;
          if (spEdge) {
            const spId = spEdge.person_a_id === sibId ? spEdge.person_b_id : spEdge.person_a_id;
            const sp = nodeMap.get(spId);
            if (sp) direction = (sib.x ?? 0) > (sp.x ?? 0) ? 1 : -1;
          }
          ghostInfos.push({ node: n, anchorX: sib.x ?? 0, anchorY: sib.y ?? 0, direction });
          return;
        }
      }
      ghostInfos.push({ node: n, anchorX: 0, anchorY: (genMap.get(n.id) ?? 0) * yGap, direction: -1 });
    });

    const ghostGroups = new Map<string, GhostInfo[]>();
    ghostInfos.forEach(gi => {
      const key = `${gi.anchorX},${gi.anchorY},${gi.direction}`;
      if (!ghostGroups.has(key)) ghostGroups.set(key, []);
      ghostGroups.get(key)!.push(gi);
    });
    ghostGroups.forEach(group => {
      group.forEach((gi, i) => {
        gi.node.x = gi.anchorX + gi.direction * X_GAP * (i + 1);
        gi.node.y = gi.anchorY;
      });
    });

    nodes.filter(n => n.ghost).forEach(n => {
      const ghostSpEdge = spouseEdges.find(e => e.person_a_id === n.id || e.person_b_id === n.id);
      if (!ghostSpEdge) return;
      const gsId = ghostSpEdge.person_a_id === n.id ? ghostSpEdge.person_b_id : ghostSpEdge.person_a_id;
      const gs = nodeMap.get(gsId);
      if (!gs) return;
      const sibEdge = siblingEdges.find(e => e.person_a_id === n.id || e.person_b_id === n.id);
      if (!sibEdge) return;
      const sibId = sibEdge.person_a_id === n.id ? sibEdge.person_b_id : sibEdge.person_a_id;
      const sib = nodeMap.get(sibId);
      if (!sib) return;
      const ghostIsRight = (n.x ?? 0) > (sib.x ?? 0);
      gs.x = ghostIsRight ? (n.x ?? 0) + X_GAP : (n.x ?? 0) - X_GAP;
      gs.y = n.y ?? 0;
    });

    // ── Marriage nodes ────────────────────────────────────────────────────────

    const marriageNodes: MarriageNode[] = [];
    edges.filter(e => e.relation_type === 'SPOUSE').forEach(e => {
      const a = nodeMap.get(e.person_a_id);
      const b = nodeMap.get(e.person_b_id);
      if (a && b) {
        marriageNodes.push({
          id: `marriage-${e.id}`,
          x: ((a.x ?? 0) + (b.x ?? 0)) / 2,
          y: ((a.y ?? 0) + (b.y ?? 0)) / 2,
          spouseAId: e.person_a_id,
          spouseBId: e.person_b_id,
        });
      }
    });

    return { nodes, edges, marriageNodes, genMap };
  }

  private runSimulation(nodes: GraphNode[], edges: GraphEdge[], genMap: Map<string, number>, marriageNodes: MarriageNode[]): void {
    this.simulation = undefined;
    this.g.selectAll<SVGGElement, GraphNode>('g.node')
      .attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    this.updateEdges(nodes, marriageNodes, edges);
    this.updateGenLabels();
    if (this.focusedId) this.centerOnNode(this.focusedId, nodes);
  }

  private drawEdges(edges: GraphEdge[], nodes: GraphNode[], marriageNodes: MarriageNode[]): void {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    const parentToMarriage = new Map<string, MarriageNode>();
    marriageNodes.forEach(m => {
      parentToMarriage.set(m.spouseAId, m);
      parentToMarriage.set(m.spouseBId, m);
    });

    const childToParents = new Map<string, string[]>();
    edges.filter(e => e.relation_type === 'PARENT_CHILD').forEach(e => {
      if (!childToParents.has(e.person_b_id)) childToParents.set(e.person_b_id, []);
      childToParents.get(e.person_b_id)!.push(e.person_a_id);
    });

    const drawnChildLines = new Set<string>();

    edges.forEach(edge => {
      const a = nodeMap.get(edge.person_a_id);
      const b = nodeMap.get(edge.person_b_id);
      if (!a || !b) return;
      const color = RELATION_COLORS[edge.relation_type] ?? '#999';

      if (edge.relation_type === 'SPOUSE') {
        this.g.append('path')
          .datum(edge)
          .attr('class', 'spouse-line')
          .attr('d', spousePath(a.x ?? 0, a.y ?? 0, b.x ?? 0, b.y ?? 0))
          .attr('stroke', color).attr('stroke-width', 2)
          .attr('stroke-dasharray', '6,3').attr('fill', 'none');

      } else if (edge.relation_type === 'PARENT_CHILD') {
        const childId = edge.person_b_id;
        if (drawnChildLines.has(childId)) return;
        drawnChildLines.add(childId);

        const child = nodeMap.get(childId)!;
        const parents = childToParents.get(childId) ?? [];

        const marriage = parents.length === 2
          ? (parentToMarriage.get(parents[0])?.spouseAId === parents[1] ||
             parentToMarriage.get(parents[0])?.spouseBId === parents[1]
             ? parentToMarriage.get(parents[0]) : null)
          : null;

        const src = marriage ?? nodeMap.get(parents[0])!;
        this.g.append('path')
          .datum({ edgeId: edge.id, type: 'PARENT_CHILD', childId })
          .attr('class', 'edge-path')
          .attr('d', parentChildPath(src.x ?? 0, src.y ?? 0, child.x ?? 0, child.y ?? 0))
          .attr('stroke', color).attr('stroke-width', 2).attr('fill', 'none');

      } else {
        this.g.append('path')
          .datum({ edgeId: edge.id, type: 'SIBLING', aId: edge.person_a_id, bId: edge.person_b_id })
          .attr('class', 'edge-path')
          .attr('d', siblingPath(a.x ?? 0, a.y ?? 0, b.x ?? 0, b.y ?? 0))
          .attr('stroke', color).attr('stroke-width', 1.5).attr('fill', 'none')
          .attr('stroke-dasharray', '5,4');
      }
    });
  }

  private drawMarriageNodes(marriageNodes: MarriageNode[]): void {
    marriageNodes.forEach(m => {
      this.g.append('circle')
        .datum(m)
        .attr('class', 'marriage-node')
        .attr('cx', m.x).attr('cy', m.y)
        .attr('r', MARRIAGE_NODE_RADIUS)
        .attr('fill', '#E05C5C').attr('stroke', '#fff').attr('stroke-width', 2);
    });
  }

  private updateEdges(nodes: GraphNode[], marriageNodes: MarriageNode[], edges: GraphEdge[]): void {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    this.g.selectAll<SVGPathElement, GraphEdge>('path.spouse-line')
      .attr('d', function(d) {
        const a = nodeMap.get(d.person_a_id);
        const b = nodeMap.get(d.person_b_id);
        if (!a || !b) return '';
        return spousePath(a.x ?? 0, a.y ?? 0, b.x ?? 0, b.y ?? 0);
      });

    marriageNodes.forEach(m => {
      const a = nodeMap.get(m.spouseAId);
      const b = nodeMap.get(m.spouseBId);
      if (a && b) {
        m.x = ((a.x ?? 0) + (b.x ?? 0)) / 2;
        m.y = ((a.y ?? 0) + (b.y ?? 0)) / 2;
      }
    });

    this.g.selectAll<SVGCircleElement, MarriageNode>('circle.marriage-node')
      .attr('cx', d => d.x)
      .attr('cy', d => d.y);

    const parentToMarriage = new Map<string, MarriageNode>();
    marriageNodes.forEach(m => {
      parentToMarriage.set(m.spouseAId, m);
      parentToMarriage.set(m.spouseBId, m);
    });

    const childToParents = new Map<string, string[]>();
    edges.filter(e => e.relation_type === 'PARENT_CHILD').forEach(e => {
      if (!childToParents.has(e.person_b_id)) childToParents.set(e.person_b_id, []);
      childToParents.get(e.person_b_id)!.push(e.person_a_id);
    });

    this.g.selectAll<SVGPathElement, { edgeId: string, type: string, childId?: string, aId?: string, bId?: string }>('path.edge-path')
      .attr('d', function(d) {
        if (d.type === 'PARENT_CHILD' && d.childId) {
          const child = nodeMap.get(d.childId);
          if (!child) return '';
          const parents = childToParents.get(d.childId) ?? [];
          const marriage = parents.length === 2
            ? (parentToMarriage.get(parents[0])?.spouseAId === parents[1] ||
               parentToMarriage.get(parents[0])?.spouseBId === parents[1]
               ? parentToMarriage.get(parents[0]) : null)
            : null;
          const src = marriage ?? nodeMap.get(parents[0]);
          if (!src) return '';
          return parentChildPath(src.x ?? 0, src.y ?? 0, child.x ?? 0, child.y ?? 0);
        } else if (d.type === 'SIBLING' && d.aId && d.bId) {
          const a = nodeMap.get(d.aId);
          const b = nodeMap.get(d.bId);
          if (!a || !b) return '';
          return siblingPath(a.x ?? 0, a.y ?? 0, b.x ?? 0, b.y ?? 0);
        }
        return '';
      });
  }

  private getNodeFill(): string {
    return getComputedStyle(document.body).getPropertyValue('--node-fill').trim() || '#E8F0FE';
  }

  private getDeceasedFill(): string {
    return getComputedStyle(document.body).getPropertyValue('--node-fill-deceased').trim() || '#D8D8D8';
  }

  private nodeFillFor(d: GraphNode): string {
    return d.death_date ? this.getDeceasedFill() : this.getNodeFill();
  }

  private drawNodes(nodes: GraphNode[], edges: GraphEdge[]): void {
    const self = this;

    const drag = d3.drag<SVGGElement, GraphNode>()
      .on('start', function(event, d) {
        event.sourceEvent.stopPropagation();
        d3.select(this).style('cursor', 'grabbing').raise();
      })
      .on('drag', function(event, d) {
        d.x = event.x;
        d3.select(this).attr('transform', `translate(${event.x},${d.y ?? 0})`);
        self.updateEdges(self.liveNodes, self.liveMarriageNodes, edges);
      })
      .on('end', function(event, d) {
        d3.select(this).style('cursor', 'grab');
      });

    const groups = this.g.selectAll<SVGGElement, GraphNode>('g.node')
      .data(nodes, d => d.id)
      .enter().append('g')
      .attr('class', d => d.ghost ? 'node ghost-node' : 'node')
      .attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
      .style('cursor', d => d.ghost ? 'pointer' : 'grab')
      .style('opacity', 0)
      .call(drag)
      .on('click', (event, d) => {
        event.stopPropagation();
        if (!d.ghost) {
          const el = this.g.selectAll<SVGGElement, GraphNode>('g.node')
            .filter(n => n.id === d.id);
          el.select('circle.bg-circle')
            .transition().duration(100).attr('r', (n: GraphNode) => (n.id === this.focusedId ? FOCUSED_RADIUS : NODE_RADIUS) * 1.2)
            .transition().duration(150).attr('r', (n: GraphNode) => n.id === this.focusedId ? FOCUSED_RADIUS : NODE_RADIUS);
        }
        this.zone.run(() => this.nodeClicked.emit(d.id));
      })
      .on('mouseover', function(event, d) {
        if (d.ghost) {
          d3.select(this).style('filter', 'brightness(1.15)');
        } else {
          d3.select(this).style('filter', 'brightness(1.08) drop-shadow(0 2px 6px rgba(74,144,217,0.3))');
        }
      })
      .on('mouseout', function() {
        d3.select(this).style('filter', null);
      });

    const isFocused = (d: GraphNode) => d.id === this.focusedId;
    const isGhost = (d: GraphNode) => !!d.ghost;

    groups.transition().duration(400)
      .delay((_, i) => i * 40)
      .style('opacity', d => isGhost(d) ? 0.25 : 1);

    groups.filter(isFocused).append('circle')
      .attr('r', FOCUSED_RADIUS + 6)
      .attr('fill', 'none')
      .attr('stroke', '#FFD700')
      .attr('stroke-width', 4)
      .attr('opacity', 0.7);

    groups.append('clipPath')
      .attr('id', d => `clip-${d.id}`)
      .append('circle')
      .attr('r', d => isFocused(d) ? FOCUSED_RADIUS : NODE_RADIUS);

    groups.append('circle')
      .attr('class', 'bg-circle')
      .attr('r', d => isFocused(d) ? FOCUSED_RADIUS : NODE_RADIUS)
      .attr('fill', d => isGhost(d) ? getComputedStyle(document.body).getPropertyValue('--surface2').trim() || '#F5F5F5' : this.nodeFillFor(d))
      .attr('stroke', d => isFocused(d) ? '#FFD700' : (isGhost(d) ? '#AAA' : '#4A90D9'))
      .attr('stroke-width', d => isFocused(d) ? 3 : 2)
      .attr('stroke-dasharray', d => isGhost(d) ? '4,3' : null);

    groups.each((d, i, els) => {
      const group = d3.select<SVGGElement, GraphNode>(els[i]);
      const r = isFocused(d) ? FOCUSED_RADIUS : NODE_RADIUS;
      const addInitials = (grp: d3.Selection<SVGGElement, GraphNode, null, undefined>, node: GraphNode) => {
        const initials = `${node.first_name[0]}${node.last_name[0]}`.toUpperCase();
        grp.append('text')
          .attr('class', 'initials')
          .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
          .attr('font-size', isFocused(node) ? 20 : 16)
          .attr('font-weight', 'bold')
          .attr('fill', isGhost(node) ? '#AAA' : (node.death_date ? '#888' : '#4A90D9'))
          .attr('font-family', 'Arial, Helvetica, sans-serif')
          .text(initials);
      };

      if (d.photo_url && !isGhost(d)) {
        group.append('image')
          .attr('href', d.photo_url)
          .attr('x', -r).attr('y', -r)
          .attr('width', r * 2).attr('height', r * 2)
          .attr('clip-path', `url(#clip-${d.id})`);
      } else {
        addInitials(group, d);
      }
    });

    groups.append('text')
      .attr('y', d => (isFocused(d) ? FOCUSED_RADIUS : NODE_RADIUS) + 16)
      .attr('text-anchor', 'middle')
      .attr('font-size', 12)
      .attr('font-weight', '600')
      .attr('fill', d => isGhost(d) ? '#AAA' : '#333')
      .attr('font-family', 'Arial, Helvetica, sans-serif')
      .text(d => `${d.first_name} ${d.last_name}`);

    groups.filter(d => !!(d.birth_date || d.death_date) && !isGhost(d))
      .append('text')
      .attr('y', d => (isFocused(d) ? FOCUSED_RADIUS : NODE_RADIUS) + 30)
      .attr('text-anchor', 'middle')
      .attr('font-size', 10)
      .attr('fill', '#888')
      .attr('font-family', 'Arial, Helvetica, sans-serif')
      .text(d => {
        const birth = d.birth_date ? new Date(d.birth_date).getFullYear() : '?';
        const death = d.death_date ? new Date(d.death_date).getFullYear() : null;
        return death ? `${birth} – ${death}` : `${birth}`;
      });
  }

  private centerOnNode(id: string, nodes: GraphNode[]): void {
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    const el = this.svgRef.nativeElement;
    const w = el.clientWidth || 800;
    const h = el.clientHeight || 600;
    const currentTransform = d3.zoomTransform(el);
    const scale = currentTransform.k || 1;
    const tx = w / 2 - scale * (node.x ?? 0);
    const ty = h / 2 - scale * (node.y ?? 0);
    this.svg.transition().duration(700).ease(d3.easeCubicInOut)
      .call(this.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale))
      .on('end', () => this.updateGenLabels());
  }

  private updateFocusedStyles(): void {
    const prevFocused = this.g.selectAll<SVGGElement, GraphNode>('g.node')
      .filter(d => d.id !== this.focusedId);
    const nowFocused = this.g.selectAll<SVGGElement, GraphNode>('g.node')
      .filter(d => d.id === this.focusedId);

    prevFocused.select('circle.bg-circle')
      .transition().duration(300)
      .attr('r', NODE_RADIUS)
      .attr('stroke', '#4A90D9')
      .attr('stroke-width', 2)
      .attr('fill', (d: GraphNode) => this.nodeFillFor(d));
    prevFocused.select('.focus-ring').remove();

    nowFocused.select('circle.bg-circle')
      .transition().duration(300)
      .attr('r', FOCUSED_RADIUS)
      .attr('stroke', '#FFD700')
      .attr('stroke-width', 3)
      .attr('fill', (d: GraphNode) => this.nodeFillFor(d));

    nowFocused.filter(function() {
      return d3.select(this).select('.focus-ring').empty();
    }).insert('circle', ':first-child')
      .attr('class', 'focus-ring')
      .attr('r', FOCUSED_RADIUS + 6)
      .attr('fill', 'none')
      .attr('stroke', '#FFD700')
      .attr('stroke-width', 4)
      .attr('opacity', 0.7);

    this.updateGenLabels();
    if (this.focusedId) this.centerOnNode(this.focusedId, this.liveNodes);
  }

  private applyHighlight(): void {
    const edges = this.graphData?.edges ?? [];
    const pcEdges = edges.filter(e => e.relation_type === 'PARENT_CHILD');

    if (!this.selectedId) {
      this.g.selectAll<SVGGElement, GraphNode>('g.node').style('opacity', 1)
        .select('circle.bg-circle')
        .attr('stroke', (d: GraphNode) => d.id === this.focusedId ? '#FFD700' : '#4A90D9')
        .attr('stroke-width', (d: GraphNode) => d.id === this.focusedId ? 3 : 2)
        .attr('fill', (d: GraphNode) => this.nodeFillFor(d));
      this.g.selectAll<SVGPathElement, { type: string }>('path.edge-path')
        .style('opacity', 1)
        .attr('stroke', d => d.type === 'SIBLING' ? RELATION_COLORS['SIBLING'] : RELATION_COLORS['PARENT_CHILD']);
      this.g.selectAll('path.spouse-line').style('opacity', 1).attr('stroke', '#E05C5C');
      this.g.selectAll('circle.marriage-node').style('opacity', 1);
      return;
    }

    const ancestors = new Set<string>();
    const addAncestors = (id: string) => {
      pcEdges.filter(e => e.person_b_id === id).forEach(e => {
        if (!ancestors.has(e.person_a_id)) {
          ancestors.add(e.person_a_id);
          addAncestors(e.person_a_id);
        }
      });
    };
    addAncestors(this.selectedId);

    const descendants = new Set<string>();
    const addDescendants = (id: string) => {
      pcEdges.filter(e => e.person_a_id === id).forEach(e => {
        if (!descendants.has(e.person_b_id)) {
          descendants.add(e.person_b_id);
          addDescendants(e.person_b_id);
        }
      });
    };
    addDescendants(this.selectedId);

    this.g.selectAll<SVGGElement, GraphNode>('g.node')
      .style('opacity', (d: GraphNode) => {
        if (d.ghost) return 0.25;
        if (d.id === this.selectedId || ancestors.has(d.id) || descendants.has(d.id)) return 1;
        return 0.1;
      })
      .select('circle.bg-circle')
      .attr('stroke', (d: GraphNode) => {
        if (d.id === this.focusedId) return '#FFD700';
        if (ancestors.has(d.id)) return '#F5A623';
        if (descendants.has(d.id)) return '#27AE60';
        return '#4A90D9';
      })
      .attr('stroke-width', (d: GraphNode) =>
        ancestors.has(d.id) || descendants.has(d.id) ? 3 : (d.id === this.focusedId ? 3 : 2)
      )
      .attr('fill', (d: GraphNode) => {
        if (ancestors.has(d.id)) return d.death_date ? '#E8E0D0' : '#FEF3E2';
        if (descendants.has(d.id)) return d.death_date ? '#D8E4DC' : '#E8F8EE';
        return this.nodeFillFor(d);
      });

    this.g.selectAll<SVGPathElement, { childId: string; type: string }>('path.edge-path')
      .style('opacity', (d) => {
        const childId = d.childId;
        const isAncestorLine = ancestors.has(childId) || childId === this.selectedId;
        const isDescendantLine = descendants.has(childId);
        return isAncestorLine || isDescendantLine ? 1 : 0.06;
      })
      .attr('stroke', (d) => {
        const childId = d.childId;
        if (ancestors.has(childId) || childId === this.selectedId) return '#F5A623';
        if (descendants.has(childId)) return '#27AE60';
        return '#4A90D9';
      });

    this.g.selectAll('path.spouse-line').style('opacity', 0.06);
    this.g.selectAll('circle.marriage-node').style('opacity', 0.06);
  }

  exportPng(filename = 'family-tree.png'): void {
    const padding = 80;
    const nodeR = FOCUSED_RADIUS + 20;

    const xs = this.liveNodes.map(n => n.x ?? 0);
    const ys = this.liveNodes.map(n => n.y ?? 0);
    const minX = Math.min(...xs) - nodeR;
    const maxX = Math.max(...xs) + nodeR;
    const minY = Math.min(...ys) - nodeR;
    const maxY = Math.max(...ys) + nodeR + 40;

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const w = contentW + padding * 2;
    const h = contentH + padding * 2;
    const vx = minX - padding;
    const vy = minY - padding;

    const svgEl = this.svgRef.nativeElement;
    const clone = svgEl.cloneNode(true) as SVGElement;

    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));
    clone.setAttribute('viewBox', `${vx} ${vy} ${w} ${h}`);
    clone.setAttribute('style', 'font-family: Arial, Helvetica, sans-serif;');

    const bgRect = clone.querySelector('rect') as SVGRectElement | null;
    if (bgRect) {
      bgRect.setAttribute('x', String(vx));
      bgRect.setAttribute('y', String(vy));
      bgRect.setAttribute('width', String(w));
      bgRect.setAttribute('height', String(h));
    }

    clone.querySelectorAll('.gen-labels-g').forEach(el => el.remove());

    const mainG = clone.querySelector('g:not(.gen-labels-g)') as SVGGElement | null;
    if (mainG) mainG.removeAttribute('transform');

    const legendItems = [
      { label: 'Родител-Дете', color: '#4A90D9', dash: '' },
      { label: 'Съпруг/а',    color: '#E05C5C', dash: '6,3' },
      { label: 'Брат/Сестра', color: '#4CAF50', dash: '5,4' },
    ];
    const legendNS = 'http://www.w3.org/2000/svg';
    const lgPad = 16, lgLineW = 28, lgRowH = 22, lgFontSize = 13;
    const lgWidth = 180, lgHeight = lgPad * 2 + legendItems.length * lgRowH;
    const lgX = vx + w - lgWidth - lgPad;
    const lgY = vy + h - lgHeight - lgPad;

    const lgG = document.createElementNS(legendNS, 'g');

    const lgRect = document.createElementNS(legendNS, 'rect');
    lgRect.setAttribute('x', String(lgX));
    lgRect.setAttribute('y', String(lgY));
    lgRect.setAttribute('width', String(lgWidth));
    lgRect.setAttribute('height', String(lgHeight));
    lgRect.setAttribute('rx', '8');
    lgRect.setAttribute('fill', 'rgba(255,255,255,0.92)');
    lgRect.setAttribute('stroke', '#dde3f0');
    lgRect.setAttribute('stroke-width', '1');
    lgG.appendChild(lgRect);

    legendItems.forEach((item, i) => {
      const rowY = lgY + lgPad + i * lgRowH + lgRowH / 2;
      const line = document.createElementNS(legendNS, 'line');
      line.setAttribute('x1', String(lgX + lgPad));
      line.setAttribute('y1', String(rowY));
      line.setAttribute('x2', String(lgX + lgPad + lgLineW));
      line.setAttribute('y2', String(rowY));
      line.setAttribute('stroke', item.color);
      line.setAttribute('stroke-width', '2');
      if (item.dash) line.setAttribute('stroke-dasharray', item.dash);
      lgG.appendChild(line);

      const txt = document.createElementNS(legendNS, 'text');
      txt.setAttribute('x', String(lgX + lgPad + lgLineW + 8));
      txt.setAttribute('y', String(rowY + 4));
      txt.setAttribute('font-family', 'Arial, Helvetica, sans-serif');
      txt.setAttribute('font-size', String(lgFontSize));
      txt.setAttribute('fill', '#444');
      txt.textContent = item.label;
      lgG.appendChild(txt);
    });

    clone.appendChild(lgG);

    const serializer = new XMLSerializer();
    let svgStr = serializer.serializeToString(clone);
    if (!svgStr.includes('xmlns="http://www.w3.org/2000/svg"')) {
      svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 2;
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(scale, scale);
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#F4F6FB';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.download = filename;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = url;
  }

  updateNodePhoto(personId: string, photoUrl: string | null): void {
    const node = this.liveNodes.find(n => n.id === personId);
    if (!node) return;
    node.photo_url = photoUrl ?? undefined;

    const isFocused = node.id === this.focusedId;
    const r = isFocused ? FOCUSED_RADIUS : NODE_RADIUS;

    const group = this.g.selectAll<SVGGElement, GraphNode>('g.node')
      .filter(d => d.id === personId);

    const domGroup = group.node();
    if (domGroup) {
      domGroup.querySelectorAll('image').forEach(el => el.remove());
      domGroup.querySelectorAll('text.initials').forEach(el => el.remove());
    }
    group.select('circle.bg-circle').attr('fill', this.getNodeFill());

    if (photoUrl) {
      group.append('image')
        .attr('href', photoUrl + '?t=' + Date.now())
        .attr('x', -r).attr('y', -r)
        .attr('width', r * 2).attr('height', r * 2)
        .attr('clip-path', `url(#clip-${personId})`);
    } else {
      const initials = `${node.first_name[0]}${node.last_name[0]}`.toUpperCase();
      group.append('text')
        .attr('class', 'initials')
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
        .attr('font-size', isFocused ? 20 : 16)
        .attr('font-weight', 'bold').attr('fill', '#4A90D9')
        .text(initials);
    }
  }

  private updateGenLabels(): void {
    this.gLabels.selectAll('*').remove();
    if (!this.genMap.size) return;

    const svgWidth = this.svgRef.nativeElement.clientWidth || 1200;

    const getGenNameForYear = (year: number): string => {
      return GEN_RANGES.find(g => year >= g.from && year <= g.to)?.name ?? '';
    };

    const allGens = Array.from(new Set(this.genMap.values())).sort((a, b) => a - b);

    allGens.forEach(gen => {
      const y = gen * this.Y_GAP;

      const genNodes = this.liveNodes.filter(n => this.genMap.get(n.id) === gen);
      const birthYears = genNodes
        .map(n => n.birth_date ? new Date(n.birth_date).getFullYear() : null)
        .filter((yr): yr is number => yr !== null);

      const namesFromDates = birthYears.map(yr => getGenNameForYear(yr)).filter(Boolean);
      const namesFromHints = genNodes
        .filter(n => !n.birth_date && n.generation_hint)
        .map(n => GEN_RANGES.find(g => n.generation_hint! >= g.from && n.generation_hint! <= g.to)?.name ?? '')
        .filter(Boolean);
      const allNames = [...new Set([...namesFromDates, ...namesFromHints])];
      const label = allNames.length >= 1 ? allNames[0] : '';
      const matchedGen = GEN_RANGES.find(g => g.name === label);
      const yearRange = matchedGen ? `${matchedGen.from}–${matchedGen.to} г.` : '';

      this.gLabels.append('line')
        .attr('x1', 0).attr('y1', y)
        .attr('x2', svgWidth).attr('y2', y)
        .attr('stroke', 'rgba(0,0,0,0.08)')
        .attr('stroke-width', 1);

      if (label) {
        this.gLabels.append('text')
          .attr('x', 10).attr('y', y + 16)
          .attr('font-size', 11)
          .attr('font-weight', '700')
          .attr('fill', '#bbb')
          .attr('letter-spacing', '0.6')
          .attr('font-family', 'Arial, Helvetica, sans-serif')
          .text(label.toUpperCase());
      }

      if (yearRange) {
        this.gLabels.append('text')
          .attr('x', 10).attr('y', label ? y + 30 : y + 16)
          .attr('font-size', 10)
          .attr('fill', '#ccc')
          .attr('font-family', 'Arial, Helvetica, sans-serif')
          .text(yearRange);
      }
    });
  }

  centerAll(): void {
    const el = this.svgRef.nativeElement;
    this.svg.transition().duration(400)
      .call(this.zoom.transform, d3.zoomIdentity.translate(el.clientWidth / 2, el.clientHeight / 3).scale(0.8));
  }
}
