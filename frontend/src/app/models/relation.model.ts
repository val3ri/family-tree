export type RelationType = 'PARENT_CHILD' | 'SPOUSE' | 'SIBLING';

export interface Relation {
  id: string;
  person_a_id: string;
  person_b_id: string;
  relation_type: RelationType;
  marriage_date?: string;
  marriage_place?: string;
  is_divorced: boolean;
  created_at: string;
}

export interface RelationCreate {
  person_a_id: string;
  person_b_id: string;
  relation_type: RelationType;
  marriage_date?: string;
  marriage_place?: string;
  is_divorced?: boolean;
}

export interface RelationUpdate {
  marriage_date?: string;
  marriage_place?: string;
  is_divorced: boolean;
}

export interface GraphNode {
  id: string;
  first_name: string;
  last_name: string;
  birth_date?: string;
  death_date?: string;
  generation_hint?: number;
  photo_url?: string;
  x?: number;
  y?: number;
  ghost?: boolean;
}

export interface GraphEdge {
  id: string;
  person_a_id: string;
  person_b_id: string;
  relation_type: RelationType;
  is_divorced: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
