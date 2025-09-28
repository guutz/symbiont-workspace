// Re-export the handler from the symbiont package.
// This creates the API endpoint without any custom logic.
import { handlePollBlogRequest } from 'symbiont-cms';

export const GET = handlePollBlogRequest;