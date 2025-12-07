import axios from 'axios';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Style utility
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// API Client (V1)
export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
});

// Generic Client (for Auth, etc.)
export const httpClient = axios.create({
  baseURL: '/',
  withCredentials: true,
});

// Add strict interceptors for error handling
const addInterceptors = (instance: typeof api) => {
  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        console.warn('Unauthorized access');
      }
      return Promise.reject(error);
    }
  );
};

addInterceptors(api);
addInterceptors(httpClient);
