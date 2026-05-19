import { Injectable } from '@angular/core';
import { GraphData, GraphNode, GraphEdge } from '../models/relation.model';

@Injectable({ providedIn: 'root' })
export class GraphService {

  getFocusedSubgraph(focusId: string, data: GraphData): GraphData {
    const pcEdges = data.edges.filter(e => e.relation_type === 'PARENT_CHILD');
    const spouseEdges = data.edges.filter(e => e.relation_type === 'SPOUSE');
    const siblingEdges = data.edges.filter(e => e.relation_type === 'SIBLING');
    const nodeMap = new Map(data.nodes.map(n => [n.id, n]));

    const getParents = (id: string) => pcEdges.filter(e => e.person_b_id === id).map(e => e.person_a_id);
    const getChildren = (id: string) => pcEdges.filter(e => e.person_a_id === id).map(e => e.person_b_id);
    const getSpouses = (id: string) => spouseEdges.flatMap(e =>
      e.person_a_id === id ? [e.person_b_id] : e.person_b_id === id ? [e.person_a_id] : []
    );
    const getSiblings = (id: string) => siblingEdges.flatMap(e =>
      e.person_a_id === id ? [e.person_b_id] : e.person_b_id === id ? [e.person_a_id] : []
    );

    // Стъпка 1: кръвни роднини на фокусирания (предци + наследници)
    const bloodRelatives = new Set<string>();
    bloodRelatives.add(focusId);

    const addAncestors = (id: string) => {
      getParents(id).forEach(pid => {
        if (!bloodRelatives.has(pid)) { bloodRelatives.add(pid); addAncestors(pid); }
      });
    };
    const addDescendants = (id: string) => {
      getChildren(id).forEach(cid => {
        if (!bloodRelatives.has(cid)) { bloodRelatives.add(cid); addDescendants(cid); }
      });
    };
    addAncestors(focusId);
    addDescendants(focusId);

    // Стъпка 1б: Полубратя — всички деца на ПРЕКИТЕ родители на фокусирания.
    // (само преки родители, не прародители, за да не се показват братовчеди)
    getParents(focusId).forEach(parentId => addDescendants(parentId));

    // Стъпка 2: братя/сестри на кръвните (те са също кръвни)
    // Итерираме след 1б, за да включим SIBLING ребрата и на новодобавените полубратя.
    const bloodCopy = new Set(bloodRelatives);
    bloodCopy.forEach(id => {
      getSiblings(id).forEach(sid => {
        if (!bloodRelatives.has(sid)) { bloodRelatives.add(sid); addDescendants(sid); }
      });
    });

    // Стъпка 3: съпрузи на кръвните → visible
    const visible = new Set(bloodRelatives);
    bloodRelatives.forEach(id => {
      getSpouses(id).forEach(sid => visible.add(sid));
    });

    // Стъпка 4: братя/сестри на съпрузите → ghost
    const ghost = new Set<string>();
    visible.forEach(id => {
      if (!bloodRelatives.has(id)) {
        // id е съпруг на кръвен — неговите братя/сестри → ghost
        getSiblings(id).forEach(sid => {
          if (!visible.has(sid)) ghost.add(sid);
        });
      }
    });

    const allIds = new Set([...visible, ...ghost]);

    const nodes: GraphNode[] = [];
    allIds.forEach(id => {
      const n = nodeMap.get(id);
      if (!n) return;
      nodes.push({ ...n, ghost: ghost.has(id) });
    });

    // Edges: само между видими nodes + ghost edges (само SIBLING към ghost)
    const edges = data.edges.filter(e => {
      const aIn = allIds.has(e.person_a_id);
      const bIn = allIds.has(e.person_b_id);
      if (!aIn || !bIn) return false;
      // Не показвай PARENT_CHILD или SPOUSE edges свързани с ghost nodes
      if (e.relation_type !== 'SIBLING') {
        if (ghost.has(e.person_a_id) || ghost.has(e.person_b_id)) return false;
      }
      return true;
    });

    return { nodes, edges };
  }

  // Запазваме стария метод за съвместимост
  getConnectedSubgraph(focusId: string, data: GraphData): GraphData {
    return this.getFocusedSubgraph(focusId, data);
  }
}
