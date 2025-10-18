export interface TechConfig {
  banner: {
    src: string;
    alt: string;
  };
  volume: string;
  location: string;
  email: string;
}

export const techConfig: TechConfig = {
  banner: {
    src: '/tech.svg',
    alt: 'The California Tech',
  },
  volume: 'Vol. CXXIX',
  location: 'Pasadena, CA',
  email: 'tech@caltech.edu',
};
