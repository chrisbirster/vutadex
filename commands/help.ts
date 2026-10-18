
export function help(): void {
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
  study                 Study commands
  progress              Progress commands

DECKS
  deck list             List all decks
  deck create <name>    Create a deck
  deck show <id>        View a deck
  deck rename <id> <name> Rename a deck\n  deck describe <id> <text> Set description\n  deck describe <id> --clear Clear description
  deck delete <id> [--yes] Delete a deck

CARDS
  card list <deck-id>   List cards in a deck\n  card search <deck-id> <query> Search a deck
  card add <deck-id> --front <text> --back <text>
  card show <id>        View a flashcard
  card edit <id> --front/--back <text>
  card delete <id> [--yes] Delete a flashcard

STUDY
  study                 Review due cards
  study <deck>          Study a specific deck
  study --new           Study new cards
  study --all           Study all cards
  study --cram          Practice without scheduling

PROGRESS
  stats                 Show learning statistics
  stats <deck>          Show deck statistics
  due                   Show due cards

OPTIONS
  -h, --help            Show help
  -v, --version         Show version

EXAMPLES
  vutadex deck create "Spanish"
  vutadex card add "Spanish"
  vutadex study "Spanish"
  vutadex stats
`
  console.log(output);
}
