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
  private readonly YEAR_GAP = 8;
  private minYear = 1900;
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
    const YEAR_GAP = this.YEAR_GAP;

    const spouseEdges  = edges.filter(e => e.relation_type === 'SPOUSE');
    const pcEdges      = edges.filter(e => e.relation_type === 'PARENT_CHILD');
    const siblingEdges = edges.filter(e => e.relation_type === 'SIBLING');

    // 1. Birth Year Estimation
    const estimateBirthYears = (): Map<string, number> => {
      const years = new Map<string, number>();
      
      nodes.forEach(n => {
        if (n.birth_date) {
          years.set(n.id, new Date(n.birth_date).getFullYear());
        } else if (n.generation_hint) {
          years.set(n.id, n.generation_hint);
        }
      });

      let changed = true;
      for (let iter = 0; iter < 10 && changed; iter++) {
        changed = false;
        
        nodes.forEach(n => {
          if (years.has(n.id)) return;

          // Try spouses
          const spouseIds = spouseEdges.flatMap(e => 
            e.person_a_id === n.id ? [e.person_b_id] : e.person_b_id === n.id ? [e.person_a_id] : []
          );
          for (const sid of spouseIds) {
            if (years.has(sid)) {
              years.set(n.id, years.get(sid)!);
              changed = true;
              return;
            }
          }

          // Try siblings
          const siblingIds = siblingEdges.flatMap(e => 
            e.person_a_id === n.id ? [e.person_b_id] : e.person_b_id === n.id ? [e.person_a_id] : []
          );
          const siblingYears = siblingIds.map(sid => years.get(sid)).filter(y => y !== undefined) as number[];
          if (siblingYears.length > 0) {
            const avg = Math.round(siblingYears.reduce((a, b) => a + b, 0) / siblingYears.length);
            years.set(n.id, avg);
            changed = true;
            return;
          }

          // Try parents (child is parent + 25)
          const parentIds = pcEdges.filter(e => e.person_b_id === n.id).map(e => e.person_a_id);
          const parentYears = parentIds.map(pid => years.get(pid)).filter(y => y !== undefined) as number[];
          if (parentYears.length > 0) {
            const avg = Math.round(parentYears.reduce((a, b) => a + b, 0) / parentYears.length);
            years.set(n.id, avg + 25);
            changed = true;
            return;
          }

          // Try children (parent is child - 25)
          const childIds = pcEdges.filter(e => e.person_a_id === n.id).map(e => e.person_b_id);
          const childYears = childIds.map(cid => years.get(cid)).filter(y => y !== undefined) as number[];
          if (childYears.length > 0) {
            const avg = Math.round(childYears.reduce((a, b) => a + b, 0) / childYears.length);
            years.set(n.id, avg - 25);
            changed = true;
            return;
          }
        });
      }

      const defaultYear = 1970;
      nodes.forEach(n => {
        if (!years.has(n.id)) {
          years.set(n.id, defaultYear);
        }
      });

      return years;
    };

    const estYears = estimateBirthYears();

    // 2. Structural Generation Row Assignment for Horizontal Layout (Group mapping)
    const parentMap = new Map<string, string>();
    const find = (id: string): string => {
      if (!parentMap.has(id)) {
        parentMap.set(id, id);
        return id;
      }
      let root = id;
      while (root !== parentMap.get(root)) {
        root = parentMap.get(root)!;
      }
      let curr = id;
      while (curr !== root) {
        let nxt = parentMap.get(curr)!;
        parentMap.set(curr, root);
        curr = nxt;
      }
      return root;
    };
    const union = (id1: string, id2: string) => {
      const r1 = find(id1);
      const r2 = find(id2);
      if (r1 !== r2) {
        parentMap.set(r1, r2);
      }
    };

    spouseEdges.forEach(e => union(e.person_a_id, e.person_b_id));
    siblingEdges.forEach(e => union(e.person_a_id, e.person_b_id));

    const groupNodes = new Map<string, string[]>();
    nodes.forEach(n => {
      const root = find(n.id);
      if (!groupNodes.has(root)) groupNodes.set(root, []);
      groupNodes.get(root)!.push(n.id);
    });

    const groups = Array.from(groupNodes.keys());
    const groupIndex = new Map(groups.map((g, i) => [g, i]));

    const groupAdj = new Map<number, Set<number>>();
    groups.forEach((g, idx) => groupAdj.set(idx, new Set<number>()));
    pcEdges.forEach(e => {
      const pGroup = groupIndex.get(find(e.person_a_id));
      const cGroup = groupIndex.get(find(e.person_b_id));
      if (pGroup !== undefined && cGroup !== undefined && pGroup !== cGroup) {
        groupAdj.get(pGroup)!.add(cGroup);
      }
    });

    const groupDepths = new Array(groups.length).fill(0);
    let relaxed = true;
    for (let iter = 0; iter < groups.length && relaxed; iter++) {
      relaxed = false;
      for (let pIdx = 0; pIdx < groups.length; pIdx++) {
        const pDepth = groupDepths[pIdx];
        for (const cIdx of groupAdj.get(pIdx)!) {
          if (groupDepths[cIdx] < pDepth + 1) {
            groupDepths[cIdx] = pDepth + 1;
            relaxed = true;
          }
        }
      }
    }

    const genMap = new Map<string, number>();
    nodes.forEach(n => {
      const depth = groupDepths[groupIndex.get(find(n.id))!];
      genMap.set(n.id, depth);
    });

    const usedSlots = Array.from(new Set(genMap.values())).sort((a, b) => a - b);
    const slotRemap = new Map(usedSlots.map((s, i) => [s, i]));
    genMap.forEach((s, id) => genMap.set(id, slotRemap.get(s)!));

    // 3. Exclude ghost nodes from core layout
    const ghostIds = new Set(nodes.filter(n => n.ghost).map(n => n.id));
    const ghostSpouseIds = new Set<string>();
    ghostIds.forEach(gid => {
      spouseEdges.forEach(e => {
        if (e.person_a_id === gid) ghostSpouseIds.add(e.person_b_id);
        if (e.person_b_id === gid) ghostSpouseIds.add(e.person_a_id);
      });
    });
    const excluded = new Set([...ghostIds, ...ghostSpouseIds]);

    // 4. Grid Units definition
    interface GridUnit {
      id: string;
      isCouple: boolean;
      coupleId?: string;
      personId?: string;
      aId?: string;
      bId?: string;
    }

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

    const allMainNodes = nodes.filter(n => !excluded.has(n.id));
    const isChild = new Set(pcEdges.filter(e => !excluded.has(e.person_b_id)).map(e => e.person_b_id));

    const allGridUnits: GridUnit[] = [];
    const seenCouplesMain = new Set<string>();
    allMainNodes.forEach(n => {
      const cu = coupleByPerson.get(n.id);
      if (cu) {
        if (!seenCouplesMain.has(cu.id)) {
          seenCouplesMain.add(cu.id);
          allGridUnits.push({ id: cu.id, isCouple: true, coupleId: cu.id, aId: cu.aId, bId: cu.bId });
        }
      } else {
        allGridUnits.push({ id: n.id, isCouple: false, personId: n.id });
      }
    });

    const rootUnits = allGridUnits.filter(gu => {
      if (gu.isCouple) {
        const cu = coupleUnits.find(c => c.id === gu.coupleId)!;
        return !isChild.has(cu.aId) && !isChild.has(cu.bId);
      }
      return !isChild.has(gu.personId!);
    });

    const getUnitYear = (gu: GridUnit): number => {
      if (gu.isCouple) {
        return (estYears.get(gu.aId!)! + estYears.get(gu.bId!)!) / 2;
      } else {
        return estYears.get(gu.personId!)!;
      }
    };

    const getUnitChildren = (gu: GridUnit): GridUnit[] => {
      const childIds = gu.isCouple 
        ? getCoupleChildren(coupleUnits.find(c => c.id === gu.coupleId)!)
        : getSingleChildren(gu.personId!);
      
      const childUnits: GridUnit[] = [];
      const seen = new Set<string>();
      childIds.forEach(cid => {
        const cu = coupleByPerson.get(cid);
        if (cu) {
          if (!seen.has(cu.id)) {
            seen.add(cu.id);
            childUnits.push({ id: cu.id, isCouple: true, coupleId: cu.id, aId: cu.aId, bId: cu.bId });
          }
        } else {
          if (!seen.has(cid)) {
            seen.add(cid);
            childUnits.push({ id: cid, isCouple: false, personId: cid });
          }
        }
      });

      childUnits.sort((a, b) => getUnitYear(a) - getUnitYear(b));
      return childUnits;
    };

    // 5. Level-by-level Sequencing and Relaxation Layout Algorithm
    const absoluteX = new Map<string, number>();
    
    // Group active nodes by their generation row
    const rowNodesMap = new Map<number, string[]>();
    nodes.forEach(n => {
      if (excluded.has(n.id)) return;
      const r = genMap.get(n.id)!;
      if (!rowNodesMap.has(r)) rowNodesMap.set(r, []);
      rowNodesMap.get(r)!.push(n.id);
    });

    const activeRows = Array.from(rowNodesMap.keys()).sort((a, b) => a - b);
    const orderedRowNodes = new Map<number, string[]>();

    interface SeqUnit {
      isCouple: boolean;
      aId?: string;
      bId?: string;
      personId?: string;
    }

    activeRows.forEach(r => {
      const rowNodeIds = rowNodesMap.get(r)!;
      const units: SeqUnit[] = [];
      const seen = new Set<string>();

      rowNodeIds.forEach(id => {
        if (seen.has(id)) return;
        const cu = coupleByPerson.get(id);
        if (cu) {
          seen.add(cu.aId);
          seen.add(cu.bId);
          units.push({ isCouple: true, aId: cu.aId, bId: cu.bId });
        } else {
          seen.add(id);
          units.push({ isCouple: false, personId: id });
        }
      });

      if (r === 0) {
        // Sort row 0 units by birth year
        const getUnitYear = (u: SeqUnit): number => {
          if (u.isCouple) {
            return (estYears.get(u.aId!)! + estYears.get(u.bId!)!) / 2;
          } else {
            return estYears.get(u.personId!)!;
          }
        };
        units.sort((a, b) => getUnitYear(a) - getUnitYear(b));
      } else {
        // Sort subsequent rows by parent barycenter
        const getParentX = (id: string): number | null => {
          const parentIds = pcEdges.filter(e => e.person_b_id === id).map(e => e.person_a_id);
          if (parentIds.length === 0) return null;
          const parentXs = parentIds.map(pid => absoluteX.get(pid)).filter(x => x !== undefined) as number[];
          if (parentXs.length > 0) {
            return parentXs.reduce((a, b) => a + b, 0) / parentXs.length;
          }
          return null;
        };

        const getUnitBarycenter = (u: SeqUnit): number => {
          if (u.isCouple) {
            const pA = getParentX(u.aId!);
            const pB = getParentX(u.bId!);
            if (pA !== null && pB !== null) return (pA + pB) / 2;
            if (pA !== null) return pA;
            if (pB !== null) return pB;
          } else {
            const p = getParentX(u.personId!);
            if (p !== null) return p;
          }
          // Fallback if no parents: try sibling barycenter
          const id = u.isCouple ? u.aId! : u.personId!;
          const siblingIds = siblingEdges.flatMap(e => 
            e.person_a_id === id ? [e.person_b_id] : e.person_b_id === id ? [e.person_a_id] : []
          );
          for (const sibId of siblingIds) {
            const pSib = getParentX(sibId);
            if (pSib !== null) return pSib;
          }
          return 0;
        };

        units.sort((a, b) => {
          const baryA = getUnitBarycenter(a);
          const baryB = getUnitBarycenter(b);
          if (Math.abs(baryA - baryB) < 1) {
            const yrA = a.isCouple ? (estYears.get(a.aId!)! + estYears.get(a.bId!)!) / 2 : estYears.get(a.personId!)!;
            const yrB = b.isCouple ? (estYears.get(b.aId!)! + estYears.get(b.bId!)!) / 2 : estYears.get(b.personId!)!;
            return yrA - yrB;
          }
          return baryA - baryB;
        });
      }

      // Orient spouses within CoupleUnits
      units.forEach((u, uIdx) => {
        if (!u.isCouple) return;

        const aId = u.aId!;
        const bId = u.bId!;

        const hasParentsA = pcEdges.some(e => e.person_b_id === aId);
        const hasParentsB = pcEdges.some(e => e.person_b_id === bId);

        if (hasParentsA && hasParentsB) {
          // Both are blood: compare their parent centers
          const getParentCenter = (id: string): number => {
            const parentIds = pcEdges.filter(e => e.person_b_id === id).map(e => e.person_a_id);
            const parentXs = parentIds.map(pid => absoluteX.get(pid)!).filter(x => x !== undefined);
            return parentXs.length > 0 ? parentXs.reduce((a, b) => a + b, 0) / parentXs.length : 0;
          };
          if (getParentCenter(aId) > getParentCenter(bId)) {
            u.aId = bId; u.bId = aId;
          }
        } else if (hasParentsA || hasParentsB) {
          // One is blood, one is spouse
          const bloodId = hasParentsA ? aId : bId;
          const spouseId = hasParentsA ? bId : aId;

          // Find sibling units in the current row
          const parentIds = pcEdges.filter(e => e.person_b_id === bloodId).map(e => e.person_a_id);
          const siblingIds = pcEdges.filter(e => parentIds.includes(e.person_a_id)).map(e => e.person_b_id);

          // Find sibling units that contain these siblings
          const sibUnits = units.filter(su => 
            su.isCouple 
              ? (siblingIds.includes(su.aId!) || siblingIds.includes(su.bId!))
              : siblingIds.includes(su.personId!)
          );

          // Sort sibling units by parent barycenter to get their horizontal sequence
          const getUnitBarycenter = (su: SeqUnit): number => {
            if (su.isCouple) {
              const pA = pcEdges.filter(e => e.person_b_id === su.aId!).map(e => e.person_a_id);
              const pB = pcEdges.filter(e => e.person_b_id === su.bId!).map(e => e.person_a_id);
              const pAll = [...pA, ...pB];
              const pXs = pAll.map(pid => absoluteX.get(pid)!).filter(x => x !== undefined);
              return pXs.length > 0 ? pXs.reduce((a, b) => a + b, 0) / pXs.length : 0;
            } else {
              const p = pcEdges.filter(e => e.person_b_id === su.personId!).map(e => e.person_a_id);
              const pXs = p.map(pid => absoluteX.get(pid)!).filter(x => x !== undefined);
              return pXs.length > 0 ? pXs.reduce((a, b) => a + b, 0) / pXs.length : 0;
            }
          };
          sibUnits.sort((su1, su2) => getUnitBarycenter(su1) - getUnitBarycenter(su2));

          const sibIdx = sibUnits.findIndex(su => 
            su.isCouple 
              ? (su.aId === bloodId || su.bId === bloodId)
              : su.personId === bloodId
          );

          if (sibIdx !== -1 && sibIdx < sibUnits.length / 2) {
            // Left half: spouse on left, blood on right
            u.aId = spouseId; u.bId = bloodId;
          } else {
            // Right half: blood on left, spouse on right
            u.aId = bloodId; u.bId = spouseId;
          }
        }
      });

      // Flatten units to ordered list of node IDs for this row
      const orderedIds: string[] = [];
      units.forEach(u => {
        if (u.isCouple) {
          orderedIds.push(u.aId!, u.bId!);
        } else {
          orderedIds.push(u.personId!);
        }
      });
      orderedRowNodes.set(r, orderedIds);

      // Initialize baseline X coordinates to allow parent-lookup for the next generation row
      let curX = 0;
      orderedIds.forEach(id => {
        absoluteX.set(id, curX);
        curX += X_GAP;
      });

      // Center the absoluteX coordinates of this row around 0
      const rowXs = orderedIds.map(id => absoluteX.get(id)!).filter(x => x !== undefined);
      if (rowXs.length > 0) {
        const meanX = rowXs.reduce((a, b) => a + b, 0) / rowXs.length;
        orderedIds.forEach(id => {
          absoluteX.set(id, absoluteX.get(id)! - meanX);
        });
      }
    });

    // Spread coordinates around 0 for each row initially
    const posX = new Map<string, number>();
    activeRows.forEach(r => {
      const ids = orderedRowNodes.get(r)!;
      let startX = -((ids.length - 1) * X_GAP) / 2;
      ids.forEach((id, idx) => {
        posX.set(id, startX + idx * X_GAP);
      });
    });

    // Perform 20 iterations of relaxation positioning
    for (let iter = 0; iter < 20; iter++) {
      activeRows.forEach(r => {
        const ids = orderedRowNodes.get(r)!;
        if (ids.length === 0) return;

        const targets = ids.map(id => {
          const parentIds = pcEdges.filter(e => e.person_b_id === id).map(e => e.person_a_id);
          const childIds = pcEdges.filter(e => e.person_a_id === id).map(e => e.person_b_id);

          const parentXs = parentIds.map(pid => posX.get(pid)!).filter(x => x !== undefined);
          const childXs = childIds.map(cid => posX.get(cid)!).filter(x => x !== undefined);

          let sum = 0;
          let count = 0;

          if (parentXs.length > 0) {
            sum += (parentXs.reduce((a, b) => a + b, 0) / parentXs.length) * 2;
            count += 2;
          }
          if (childXs.length > 0) {
            sum += (childXs.reduce((a, b) => a + b, 0) / childXs.length) * 2;
            count += 2;
          }

          const cu = coupleByPerson.get(id);
          if (cu) {
            const spouseId = cu.aId === id ? cu.bId : cu.aId;
            const spouseX = posX.get(spouseId);
            if (spouseX !== undefined) {
              const offset = cu.aId === id ? -X_GAP : X_GAP;
              sum += (spouseX + offset) * 1.5;
              count += 1.5;
            }
          }

          return count > 0 ? sum / count : posX.get(id)!;
        });

        // Apply calculated targets
        ids.forEach((id, idx) => {
          posX.set(id, targets[idx]);
        });

        // Resolve 1D spacing constraints (left-to-right push then right-to-left push)
        for (let i = 1; i < ids.length; i++) {
          const prevX = posX.get(ids[i - 1])!;
          const currX = posX.get(ids[i])!;
          if (currX < prevX + X_GAP) {
            posX.set(ids[i], prevX + X_GAP);
          }
        }
        for (let i = ids.length - 2; i >= 0; i--) {
          const nextX = posX.get(ids[i + 1])!;
          const currX = posX.get(ids[i])!;
          if (currX > nextX - X_GAP) {
            posX.set(ids[i], nextX - X_GAP);
          }
        }
      });
    }

    // Write computed positions back to absoluteX
    posX.forEach((x, id) => {
      absoluteX.set(id, x);
    });

    // Fallback for any unpositioned main nodes
    allGridUnits.forEach(gu => {
      if (gu.isCouple) {
        if (!absoluteX.has(gu.aId!)) {
          const x = absoluteX.size * X_GAP;
          absoluteX.set(gu.aId!, x - X_GAP / 2);
          absoluteX.set(gu.bId!, x + X_GAP / 2);
        }
      } else {
        if (!absoluteX.has(gu.personId!)) {
          const x = absoluteX.size * X_GAP;
          absoluteX.set(gu.personId!, x);
        }
      }
    });

    const minYear = Math.min(...estYears.values());
    this.minYear = minYear;

    nodes.filter(n => !excluded.has(n.id)).forEach(n => {
      n.x = absoluteX.get(n.id) ?? 0;
      n.y = (estYears.get(n.id)! - minYear) * YEAR_GAP;
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
      ghostInfos.push({ node: n, anchorX: 0, anchorY: (estYears.get(n.id)! - minYear) * YEAR_GAP, direction: -1 });
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
    if (!this.liveNodes.length) return;

    const svgWidth = this.svgRef.nativeElement.clientWidth || 1200;
    const years = this.liveNodes.map(n => Math.round((n.y ?? 0) / this.YEAR_GAP) + this.minYear);
    const activeGens = GEN_RANGES.filter(g => 
      years.some(yr => yr >= g.from && yr <= g.to)
    );

    activeGens.forEach(g => {
      const y = (g.from - this.minYear) * this.YEAR_GAP;
      const label = g.name;
      const yearRange = `${g.from}–${g.to} г.`;

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
