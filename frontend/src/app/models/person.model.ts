export interface PersonPhoto {
  id: string;
  url: string;
  caption?: string;
  order: number;
}

export interface Person {
  id: string;
  first_name: string;
  last_name: string;
  birth_date?: string;
  death_date?: string;
  generation_hint?: number;
  bio?: string;
  photo_url?: string;
  photos: PersonPhoto[];
  created_at: string;
}

export interface PersonCreate {
  first_name: string;
  last_name: string;
  birth_date?: string;
  death_date?: string;
  generation_hint?: number;
  bio?: string;
}

export interface PersonUpdate extends Partial<PersonCreate> {}
