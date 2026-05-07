export interface AdminUser {
  id: string;
  email: string;
}

export interface AuthState {
  user: AdminUser | null;
  loading: boolean;
}

export type CarStatus = 'working' | 'parking' | 'maintenance' | 'selling' | 'replacement';

export interface Car {
  id: number;
  plate_number: string;
  model_group_id: number | null;
  is_active: boolean;
}

export interface CarAvailabilityRow {
  status: CarStatus;
  [key: string]: unknown;
}

export interface CarStatusCounts {
  working: number;
  parking: number;
  maintenance: number;
  selling: number;
  replacement: number;
}

export interface AlertRow {
  plate_number: string;
  model: string;
  days_left: number;
  date_label: string;
}

export interface ModelGroup {
  id: number;
  name: string;
  brand: string;
  model: string;
  category: string;
  transmission: string;
  fuel: string;
  seats: number;
  luggage: number | null;
  daily_km: number | null;
  monthly_km: number | null;
  deposit: number | null;
  min_age: number | null;
  price: number;
  total_cars: number;
  image_url: string | null;
}

export type ModelGroupFormData = Omit<ModelGroup, 'id' | 'total_cars'>;

export type BookingStatus = 'confirmed' | 'pending' | 'cancelled' | 'completed';

export interface Booking {
  id: number;
  created_at: string;
  car_id: number;
  start_date: string;
  end_date: string;
  insurance_type: string | null;
  notes: string | null;
  pickup_location: string | null;
  dropoff_location: string | null;
  km_at_delivery: number | null;
  fuel_at_delivery: string | null;
  booking_number: string;
  additional_driver: boolean | null;
  customer_id: number;
  kabis_reported: boolean;
  invoice_issued: boolean;
  status: BookingStatus;
  additional_services: string | null;
  // Resolved from joins
  plate_number: string;
  car_model: string;
  customer_name: string;
}
