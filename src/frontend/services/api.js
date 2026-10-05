import axios from 'axios';
import { products } from '../data/products';
import { API_BASE, apiUrl } from './apiBase';

export { API_BASE, apiUrl };

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

export const productService = {
  async list() {
    return products;
  },
  async getById(id) {
    return products.find((product) => product.id === id) || null;
  },
};

/**
 * Storefront enquiries are posted to the API, which records them in MongoDB. The
 * caller keeps its own local copy as well, so an enquiry submitted while the API is
 * unreachable is still visible in this browser rather than being lost.
 */
export const enquiryService = {
  async submit(enquiry) {
    const response = await apiClient.post(apiUrl('/enquiries'), {
      reference: enquiry.reference,
      name: enquiry.name,
      mobile: enquiry.mobile,
      email: enquiry.email,
      address: enquiry.address,
      pin: enquiry.pin,
      city: enquiry.city,
      occasion: enquiry.occasion,
      notes: enquiry.notes,
      preferredContact: enquiry.preferredContact,
      indicativeTotal: enquiry.indicativeTotal,
      items: enquiry.items,
    });

    return {
      submittedAt: response.data?.data?.createdAt || new Date().toISOString(),
      reference: enquiry.reference,
      enquiry,
    };
  },
};

export const authService = {
  async login(credentials) {
    return {
      mock: true,
      message: 'Authentication is prepared for a future backend and is not secure in this frontend demo.',
      email: credentials.email,
    };
  },
};
