// Campaign registry. Each campaign owns its presentation contract and backend.
// Keep unpublished campaigns out of the player-facing selector until their home
// experience is ready.
(function registerCampaigns(root) {
  const campaigns = {
    breach: {
      id: 'breach',
      name: 'Beyond the Vale',
      description: 'Saving the world is no easy feat. Saving yourself might be a good place to start.',
      system: 'D&D 5e',
      published: true,
      videoUrl: 'assets/videos/breach-loopv2.mp4',
      apiUrl: 'https://script.google.com/macros/s/AKfycbytbnHtZQDlww0St1MzD3HfTttT3BxakNdrIbII7rvnAyHPK-_HdnbdYyYPTjSjAiIfbA/exec'
    },

    campaign2: {
      id: 'campaign-2',
      name: 'The Lamplighters',
      description: 'A new campaign is in preparation.',
      system: 'D&D 5e',
      published: true,
      apiUrl: 'https://script.google.com/macros/s/AKfycbxBxNmyfa_5TWbCp3jwP0p0bje3and5-sI9hRJig3DRqgw1A-xu5lrqAhagVUO9j893IA/exec',
      fallbackHeroes: ['Hildur', 'Kevin', 'Erik', 'Katrin', 'Rohana'],
      sheets: {
        journalRecaps: 'journal_recaps',
        journalEntries: 'journal_entries',
        mainCharacters: 'main_characters',
        people: 'people',
        places: 'places',
        factions: 'factions',
        inventory: 'inventory',
        items: 'items',
        bestiary: 'bestiary',
        worldInfo: 'world_info',
        maps: 'maps',
        gallery: 'gallery'
      },
      collections: {
        main_characters: {
          presentation: 'heroes',
          modalFields: ['species', 'class', 'age']
        },
        people: {
          presentation: 'alphabetical',
          modalFields: ['species', 'faction']
        },
        factions: {
          presentation: 'alphabetical',
          modalFields: ['type', 'leader', 'hq', 'symbol']
        },
        world_info: {
          presentation: 'category',
          groupField: 'category',
          modalFields: ['type']
        },
        items: {
          presentation: 'category',
          groupField: 'category',
          modalFields: ['type', 'effect']
        },
        bestiary: {
          presentation: 'category',
          groupField: 'category',
          modalFields: ['type', 'habitat']
        },
        places: {
          presentation: 'category',
          groupField: 'category',
          modalFields: ['type', 'region']
        }
      }
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = campaigns;
  if (root) root.NexusCampaigns = campaigns;
})(typeof window !== 'undefined' ? window : globalThis);
