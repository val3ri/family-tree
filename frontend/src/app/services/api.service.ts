import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Person, PersonCreate, PersonUpdate, PersonPhoto } from '../models/person.model';
import { Relation, RelationCreate, GraphData } from '../models/relation.model';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = '/api';

  constructor(private http: HttpClient) {}

  // Persons
  getPersons(): Observable<Person[]> {
    return this.http.get<Person[]>(`${this.base}/persons/`);
  }

  getPerson(id: string): Observable<Person> {
    return this.http.get<Person>(`${this.base}/persons/${id}`);
  }

  createPerson(data: PersonCreate): Observable<Person> {
    return this.http.post<Person>(`${this.base}/persons/`, data);
  }

  updatePerson(id: string, data: PersonUpdate): Observable<Person> {
    return this.http.put<Person>(`${this.base}/persons/${id}`, data);
  }

  deletePerson(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/persons/${id}`);
  }

  uploadPhoto(id: string, file: File): Observable<Person> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<Person>(`${this.base}/persons/${id}/photo`, form);
  }

  addGalleryPhoto(id: string, file: File, caption: string = ''): Observable<PersonPhoto> {
    const form = new FormData();
    form.append('file', file);
    form.append('caption', caption);
    return this.http.post<PersonPhoto>(`${this.base}/persons/${id}/photos`, form);
  }

  deleteGalleryPhoto(personId: string, photoId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/persons/${personId}/photos/${photoId}`);
  }

  setProfilePhoto(personId: string, photoId: string): Observable<Person> {
    return this.http.patch<Person>(`${this.base}/persons/${personId}/photos/${photoId}/set-profile`, {});
  }

  unsetProfilePhoto(personId: string): Observable<Person> {
    return this.http.patch<Person>(`${this.base}/persons/${personId}/photos/unset-profile`, {});
  }

  // Relations
  getRelations(): Observable<Relation[]> {
    return this.http.get<Relation[]>(`${this.base}/relations/`);
  }

  createRelation(data: RelationCreate): Observable<Relation> {
    return this.http.post<Relation>(`${this.base}/relations/`, data);
  }

  deleteRelation(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/relations/${id}`);
  }

  // Graph
  getGraph(): Observable<GraphData> {
    return this.http.get<GraphData>(`${this.base}/graph/`);
  }
}
