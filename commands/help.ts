
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
  deck show <name>      View a deck
  deck rename <id>      Rename a deck
  deck delete <id>      Delete a deck

CARDS
  card list <deck>      List cards in a deck
  card add <deck>       Add a flashcard
  card show <id>        View a flashcard
  card edit <id>        Edit a flashcard
  card delete <id>      Delete a flashcard

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
