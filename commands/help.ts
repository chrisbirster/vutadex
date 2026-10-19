export function handleHelpCommand(): number {
  const output = `
Vutadex — Terminal Flashcards
Learn smarter. Remember longer.

USAGE
  vutadex <command> [options]

COMMANDS
  help                  Show this help message
  version               Show version
  doctor                Show setup status
  deck                  Deck commands
  card                  Card commands
  note                  Logical notes and generated cards
  media                 Content-addressed local images
  study                 Study commands
  progress              Progress commands

DECKS
  deck list             List all decks
  deck create <name>    Create a deck
  deck show <id>        View a deck
  deck rename <id> <name> Rename a deck
  deck describe <id> <text> Set description
  deck describe <id> --clear Clear description
  deck delete <id> [--yes] Delete a deck

NOTES
  note types             List built-in note types
  note add <deck-id> <type> <fields...> Create generated cards
  note list <deck-id>    List logical notes
  note show <note-id>    Show fields and generated cards
  note edit <note-id> <fields...> Update note without resetting FSRS
  note delete <note-id> [--yes] Retire note and preserve history

MEDIA
  media add <image-path> Store local PNG/JPEG/WebP/GIF
  media inspect <ref>    Resolve saved media reference

CARDS
  card list <deck-id>   List cards in a deck
  card search <deck-id> <query> Search a deck
  card add <deck-id> --front <text> --back <text>
  card show <id>        View a flashcard
  card edit <id> --front/--back <text>
  card delete <id> [--yes] Delete a flashcard
  card review <id> <rating> Record Again/Hard/Good/Easy
  card undo <id>        Undo last review
  card schedule <id>    Show FSRS-7 memory and due date
  card history <id>     Show review/undo history

STUDY
  study                 Review due cards
  study <deck-id>       Study due cards in a deck
  study --resume        Resume an unfinished session
  study --restart       Abandon old queue and start again
  study --new-limit N   Limit new cards per session
  study --review-limit N Limit due reviews per session
  study --new           Study only new cards
  study --all           Review all cards (updates FSRS)
  study --help          Show interactive study shortcuts

PROGRESS
  stats                 Show global study statistics and 7-day due forecast
  stats <deck-id>       Show deck statistics and due forecast
  stats [deck-id] --days N  Set forecast horizon (1–90 UTC days)
  due [deck-id]         Show due and new cards

OPTIONS
  -h, --help            Show help
  -v, --version         Show version

EXAMPLES
  vutadex deck create "Spanish"
  vutadex card add "Spanish"
  vutadex study 1
  vutadex stats
`
  console.log(output);
  return 0;
}
