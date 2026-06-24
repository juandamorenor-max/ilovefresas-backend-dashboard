export interface CatalogEntry {
  id: string;
  nombre: string;
  precio: number;
  categoria?: string;
  aliases?: string[];
  requiere_personalizacion?: boolean;
  opciones?: string | null;
}

export interface IlovefresasCatalog {
  productos: CatalogEntry[];
  toppings: CatalogEntry[];
  adicionales: CatalogEntry[];
}

export interface OrderItem {
  producto_id: string;
  cantidad: number;
  toppings: string[];
  adicionales: string[];
  personalizacion: string | null;
}

export interface CatalogIndex {
  catalog: IlovefresasCatalog;
  productosById: Map<string, CatalogEntry>;
  toppingsById: Map<string, CatalogEntry>;
  adicionalesById: Map<string, CatalogEntry>;
}
