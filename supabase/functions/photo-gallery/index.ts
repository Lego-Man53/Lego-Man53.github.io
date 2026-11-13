import { createGalleryHandler } from './handler.js';

Deno.serve(createGalleryHandler(Deno.env.toObject()));
