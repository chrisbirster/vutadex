// Educational proof model for one Vutadex deck operation.
// This is NOT the TypeScript/SQLite implementation.
// Run with: dafny verify verification/deck-rename.dfy
//
// Assumptions outside this model:
// - A boundary parser has validated the cleaned deck name using TypeScript rules.
// - canonicalName is consistent with SQLite's COLLATE NOCASE semantics.
// - Cards is a logical abstraction of existing card membership.
// - Database writes implement the same transition atomically.

module DeckRename {
  datatype Description = Missing | Present(value: string)

  datatype Deck = Deck(
    name: string,
    canonicalName: string,
    description: Description,
    createdAt: string,
    cards: set<nat>
  )

  // The Dafny string length is NOT the same unit as JS UTF-16 length.
  // This predicate is only an abstraction of Vutadex's name validation.
  predicate ValidName(name: string) {
    0 < |name| <= 120
  }

  predicate ValidDescription(description: Description) {
    match description
    case Missing => true
    case Present(text) => |text| <= 2000
  }

  predicate ValidStore(store: map<nat, Deck>) {
    (forall id: nat ::
      id in store ==>
        id > 0 &&
        ValidName(store[id].name) &&
        |store[id].canonicalName| > 0 &&
        ValidDescription(store[id].description)) &&
    (forall left: nat, right: nat ::
      left in store && right in store && left != right ==>
        store[left].canonicalName != store[right].canonicalName)
  }

  // A successful rename is a single update of the target deck's name/key.
  // The postconditions say precisely what is preserved.
  method Rename(
    before: map<nat, Deck>,
    id: nat,
    newName: string,
    canonicalName: string
  ) returns (after: map<nat, Deck>)
    requires ValidStore(before)
    requires id in before
    requires ValidName(newName)
    requires |canonicalName| > 0
    requires forall other: nat ::
      other in before && other != id ==>
        before[other].canonicalName != canonicalName

    ensures ValidStore(after)
    ensures after.Keys == before.Keys
    ensures after[id].name == newName
    ensures after[id].canonicalName == canonicalName
    ensures after[id].description == before[id].description
    ensures after[id].createdAt == before[id].createdAt
    ensures after[id].cards == before[id].cards
    ensures forall other: nat ::
      other in before && other != id ==> after[other] == before[other]
  {
    var old := before[id];
    after := before[id := Deck(
      newName,
      canonicalName,
      old.description,
      old.createdAt,
      old.cards
    )];
  }
}
