export interface KlipyMedia {
    id: number;
    title: string;
    type: 'gif' | 'sticker';
    url: string; // The optimal URL for display
    previewUrl: string; // Smaller/preview URL
}

const API_KEY = import.meta.env.VITE_KLIPY_API_KEY;
const APP_KEY = import.meta.env.VITE_KLIPY_APP_KEY || 'SharedDrop';
const BASE_URL = 'https://api.klipy.com/api/v1';

// Generate or retrieve a persistent customer ID
const getCustomerId = () => {
    let id = localStorage.getItem('klipy_customer_id');
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem('klipy_customer_id', id);
    }
    return id;
};

// Mapping local types to Klipy API response structure
interface KlipyResponse {
    result: boolean;
    data: {
        data?: Array<{
            id: number;
            title: string;
            type: string;
            file: {
                sm: {
                    gif: { url: string };
                    webp: { url: string };
                };
                md: {
                    gif: { url: string };
                    webp: { url: string };
                }
            }
        }>;
        // Search/Categories might have different structure
        categories?: Array<{
            category: string;
            query: string;
            preview_url: string;
        }>;
    }
}

export const klipy = {
    async fetchTrending(type: 'gifs' | 'stickers', page = 1): Promise<KlipyMedia[]> {
        const customerId = getCustomerId();
        // Construct endpoint with customer_id
        const endpoint = `${BASE_URL}/${API_KEY}/${type}/trending?page=${page}&per_page=20&customer_id=${customerId}&locale=en_US`;

        try {
            const res = await fetch(endpoint);
            const json: KlipyResponse = await res.json();

            if (!json.result || !json.data.data) return [];

            return json.data.data.map(item => {
                const md = item.file?.md;
                const sm = item.file?.sm;
                const url = md?.webp?.url || md?.gif?.url || sm?.webp?.url || sm?.gif?.url || '';
                const previewUrl = sm?.webp?.url || sm?.gif?.url || md?.webp?.url || md?.gif?.url || '';

                return {
                    id: item.id,
                    title: item.title,
                    type: type === 'gifs' ? 'gif' : 'sticker',
                    url,
                    previewUrl
                };
            });
        } catch (e) {
            console.error('Klipy Trending Error:', e);
            return [];
        }
    },

    async search(type: 'gifs' | 'stickers', query: string, page = 1): Promise<KlipyMedia[]> {
        const customerId = getCustomerId();
        const endpoint = `${BASE_URL}/${API_KEY}/${type}/search?page=${page}&per_page=20&q=${encodeURIComponent(query)}&customer_id=${customerId}&locale=en_US`;

        try {
            const res = await fetch(endpoint);
            const json: KlipyResponse = await res.json();

            if (!json.result || !json.data.data) return [];

            return json.data.data.map(item => {
                const md = item.file?.md;
                const sm = item.file?.sm;
                const url = md?.webp?.url || md?.gif?.url || sm?.webp?.url || sm?.gif?.url || '';
                const previewUrl = sm?.webp?.url || sm?.gif?.url || md?.webp?.url || md?.gif?.url || '';

                return {
                    id: item.id,
                    title: item.title,
                    type: type === 'gifs' ? 'gif' : 'sticker',
                    url,
                    previewUrl
                };
            });
        } catch (e) {
            console.error('Klipy Search Error:', e);
            return [];
        }
    },

    async fetchCategories(type: 'gifs' | 'stickers'): Promise<{ id: string, label: string, preview: string }[]> {
        // Categories typically don't strictly need customer_id but good to pass if doc says so, but previous curl didn't have it for cats?
        // Wait, user curl for categories: `.../categories?locale={country_code}`. No customer_id.
        const endpoint = `${BASE_URL}/${API_KEY}/${type}/categories?locale=en_US`;

        try {
            const res = await fetch(endpoint);
            const json: KlipyResponse = await res.json();

            if (!json.result || !json.data.categories) return [];

            return json.data.categories.map(cat => ({
                id: cat.query,
                label: cat.category,
                preview: cat.preview_url
            }));
        } catch (e) {
            console.error('Klipy Categories Error:', e);
            return [];
        }
    }
};
