# ai-sticker-generation Specification (Context Enhancement)

## Purpose
Enhances existing sticker generation to leverage the context library for improved explanations.

## ADDED Requirements

### Requirement: Context-Enhanced Auto-Explanation
The system SHALL inject relevant context from the course library when generating auto-stickers.

#### Scenario: Auto-explain with context injection
- **GIVEN** a user clicks "Explain this page" on page 15 of Lecture05.pdf
- **AND** page 15 contains text "using the chain rule to differentiate composite functions"
- **AND** Lecture03.pdf has a context entry for "Chain Rule" formula
- **WHEN** the system builds the auto-explain prompt
- **THEN** context retrieval extracts keywords ["chain rule", "differentiate", "composite functions"]
- **AND** retrieves the "Chain Rule" formula from Lecture03
- **AND** the AI prompt includes:
  ```
  <knowledge-base>
  [
    {
      "type": "formula",
      "title": "Chain Rule",
      "content": "If f(x) = g(h(x)), then f'(x) = g'(h(x)) · h'(x)",
      "source": "Lecture03.pdf, page 8"
    }
  ]
  </knowledge-base>

  Current page text: ...using the chain rule to differentiate composite functions...
  ```
- **AND** the generated sticker may reference the formula from Lecture03

#### Scenario: Auto-explain cites previous definitions
- **GIVEN** page 20 mentions "risky asset hedging"
- **AND** Lecture05.pdf page 12 has a principle about risk-free rates for hedged portfolios
- **WHEN** the system generates auto-stickers for page 20
- **THEN** the sticker content includes "According to the principle from page 12, when a risky asset is perfectly hedged..."
- **AND** the citation helps students connect concepts across pages

#### Scenario: Graceful fallback when context unavailable
- **GIVEN** context retrieval fails due to database error
- **WHEN** auto-explain is called
- **THEN** the system logs the error
- **AND** proceeds with original prompt (no context)
- **AND** stickers are still generated successfully
- **AND** user is not notified of degradation

### Requirement: Context-Enhanced Selection Explanation
The system SHALL inject relevant context when explaining user-selected text or images.

#### Scenario: Selection-explain with definition context
- **GIVEN** a user selects text "partial derivative" on page 18
- **AND** Lecture02.pdf has a definition entry for "Partial Derivative"
- **WHEN** the system generates the explanation
- **THEN** the prompt includes the definition from Lecture02
- **AND** the explanation sticker uses the formal definition as foundation
- **AND** adds clarification specific to the selected text

#### Scenario: Image selection with theorem context
- **GIVEN** a user selects a diagram showing the Mean Value Theorem
- **AND** Lecture04.pdf has a theorem entry for "Mean Value Theorem"
- **WHEN** the system generates explanation for the selected image
- **THEN** reference context is derived from nearby text (existing behavior)
- **AND** theorem definition is retrieved from context library
- **AND** the explanation connects the diagram to the formal theorem statement

---

## REMOVED Requirements

None (context is additive enhancement, no removals).

---
