-- Card Game: self-contained LÖVE2D implementation. Card definitions are loaded from Decks_Cards.csv.
local BACKUP_NUMBER = 30 -- Track backup number (continues the backup_save_## sequence in backups/)
local function createBackup()
  -- Use shell for accurate timestamp (Lua os.date may have timezone issues)
  local timestamp = os.date("%Y-%m-%d_%H-%M-%S") -- Fallback to Lua if shell unavailable
  local backupName = "backup_save_"..BACKUP_NUMBER.."_"..timestamp..".lua"
  BACKUP_NUMBER = BACKUP_NUMBER + 1
  local content = love.filesystem.read("main.lua")
  if content then love.filesystem.write(backupName, content) return backupName end
  return nil
end

-- Geometry remains code-owned; balance and player-facing definitions load from CSV.
local CONFIG = {CARD_WIDTH=95,CARD_HEIGHT=135}
local DATA={}
local VIRTUAL_WIDTH,VIRTUAL_HEIGHT,STARTING_PLAYER_HEALTH,STARTING_HAND_SIZE = nil,nil,nil,nil
local MANA_GROWTH_PER_TURN,MAX_FIELD_CHARACTERS,MAX_FIELD_EQUIPMENT,MAX_FIELD_AREAS = nil,nil,nil,nil
local cardW,cardH,TURN_PHASES = CONFIG.CARD_WIDTH,CONFIG.CARD_HEIGHT,{}
local PHASE_DEFINITIONS,UI_TEXT = {},{}
function DATA.loadGameRules()
  local data=love.filesystem.read("data/game_rules.csv");assert(data,"data/game_rules.csv could not be read")
  for line in data:gmatch("[^\r\n]+") do
    if line:sub(1,1)~="#" and not line:match("^RuleID,") then
      local c=parseCSV(line);local id,value,kind=c[1],c[2],c[3]
      if id and id~="" then
        local v=kind=="number" and tonumber(value) or value
        CONFIG[id]=v
      end
    end
  end
  VIRTUAL_WIDTH=CONFIG.virtual_width;VIRTUAL_HEIGHT=CONFIG.virtual_height
  STARTING_PLAYER_HEALTH=CONFIG.starting_player_health;STARTING_HAND_SIZE=CONFIG.starting_hand_size
  MANA_GROWTH_PER_TURN=CONFIG.mana_growth_per_turn;MAX_FIELD_CHARACTERS=CONFIG.max_field_characters
  MAX_FIELD_EQUIPMENT=CONFIG.max_field_equipment;MAX_FIELD_AREAS=CONFIG.max_field_areas
  assert(VIRTUAL_WIDTH and VIRTUAL_HEIGHT and STARTING_PLAYER_HEALTH and STARTING_HAND_SIZE,"Required game rules are missing from data/game_rules.csv")
end
function DATA.loadPhaseData()
  local data=love.filesystem.read("data/phases.csv");assert(data,"data/phases.csv could not be read")
  local ordered={}
  for line in data:gmatch("[^\r\n]+") do
    if line:sub(1,1)~="#" and not line:match("^PhaseID,") then
      local c=parseCSV(line);local order=tonumber(c[3])
      if c[1] and order then ordered[#ordered+1]={id=c[1],name=c[2],order=order,instruction=c[4] or ""} end
    end
  end
  table.sort(ordered,function(a,b) return a.order<b.order end);TURN_PHASES={}
  for i,phase in ipairs(ordered) do TURN_PHASES[i]=phase.name;PHASE_DEFINITIONS[i]=phase end
  assert(#TURN_PHASES>0,"data/phases.csv contains no phases")
end
function DATA.loadUIText()
  local data=love.filesystem.read("data/ui_text.csv");assert(data,"data/ui_text.csv could not be read")
  for line in data:gmatch("[^\r\n]+") do
    if line:sub(1,1)~="#" and not line:match("^TextID,") then
      local c=parseCSV(line);if c[1] and c[1]~="" then UI_TEXT[c[1]]=c[2] or "" end
    end
  end
end
function DATA.text(id,fallback) return UI_TEXT[id] or fallback or id end

-- Game state (plain variables; these ARE the live source of truth, mutated directly
-- throughout the file -- there is no separate "state" table shadowing these)
local CARD_TEMPLATES, CARD_BY_ID, GROUP_POOLS = {}, {}, { Simple = {}, Monkey = {}, Zombie = {}, Fighter = {} }
local DECK_DEFINITIONS, DECK_ORDER = {}, {}
local players, activeIndex, phaseIndex, round = {}, 1, 1, 1
local gameState = "menu"
local selectedDeck = "simple_starter"
local selectedAttacker, draggedCard, dragIndex, dragX, dragY
local signalTargetCard, equipTargetCard, detailViewCard, equipmentDetailCard, graveyardViewPlayer
local mouseX, mouseY, gameOver, winner, transition, shake = 0, 0, false, nil, 0, 0
local particles, trails, time, hoverButton = {}, {}, 0, nil
local drawAnimation = { active = false, card = nil, progress = 0, startX = 0, startY = 0, endX = 0, endY = 0 }
local entryTransition = { active = false, progress = 0, duration = 1.65 }
local storm = { rain = {}, eyes = {}, lightning = nil, flash = 0, nextLightning = 0, nextEyes = 0 }
local menuParticles = {}
local fonts, canvas
local scale, offsetX, offsetY = 1, 0, 0
-- Card play fly animation queue (multiple cards can fly simultaneously)
local playAnimations = {}
-- Turn banner animation state
local turnBanner = { active = false, progress = 0, text = "", duration = 1.4 }
-- Tutorial hints (shown once per session)
local tutorialHints = { shownDraw = false, shownSetup = false, shownBattle = false }

-- ============================================================================
-- DEBUG: UNDO SYSTEM (temporary QA/testing tool, NOT meant to ship)
-- To remove this feature entirely for the final build:
--   1. Delete this whole marked block.
--   2. Delete every line/block tagged "-- DEBUG UNDO" elsewhere in the file
--      (search the file for "DEBUG UNDO" to find them all: playCard,
--      resolveCharacterAttack, attachFieldEquipment, applySignalToTarget,
--      startDrawAnimation, endTurn, drawUIHeader, and love.mousepressed).
-- Everything else keeps working unchanged once these pieces are removed --
-- this system only reads/restores existing state, it never changes any of
-- the game's normal logic.
-- ============================================================================
local DEBUG_UNDO_ENABLED = true
local undoStack = {}
local UNDO_MAX_STEPS = 25

-- Deep copy that safely handles circular references. Battlefield characters
-- store `owner` pointing back at their player, which the game's normal
-- deepcopy() (defined below, no cycle detection) would recurse into forever,
-- so undo uses its own copy function instead.
local function deepcopyCyclic(v, seen)
  if type(v)~="table" then return v end
  seen = seen or {}
  if seen[v] then return seen[v] end
  local n = {}
  seen[v] = n
  for k,x in pairs(v) do n[deepcopyCyclic(k,seen)]=deepcopyCyclic(x,seen) end
  return n
end

-- Capture a full snapshot of the mutable game state before an action is applied.
-- Declared as a global (no "local") so it's callable from functions defined
-- earlier in the file, matching this codebase's existing forward-reference
-- pattern (see dealDamageToCharacter / initBattlefieldCharacter).
function saveUndoSnapshot()
  undoStack[#undoStack+1] = {
    players = deepcopyCyclic(players),
    activeIndex = activeIndex,
    phaseIndex = phaseIndex,
    round = round,
    gameOver = gameOver,
    winnerId = winner and winner.id or nil
  }
  if #undoStack > UNDO_MAX_STEPS then table.remove(undoStack,1) end
end

-- Restore the most recently saved snapshot and clear any transient UI/targeting
-- state so nothing is left pointing at cards from before the restore.
function undoLastAction()
  if #undoStack==0 then return end
  local snap = table.remove(undoStack)
  players = snap.players
  activeIndex = snap.activeIndex
  phaseIndex = snap.phaseIndex
  round = snap.round
  gameOver = snap.gameOver
  winner = nil
  if snap.winnerId then for _,p in ipairs(players) do if p.id==snap.winnerId then winner=p end end end
  selectedAttacker=nil;draggedCard=nil;dragIndex=nil;signalTargetCard=nil;equipTargetCard=nil
  detailViewCard=nil;equipmentDetailCard=nil;graveyardViewPlayer=nil
  drawAnimation.active=false
end
-- ============================================================================
-- END DEBUG: UNDO SYSTEM
-- ============================================================================

-- ============================================================================
-- DEBUG: MANA/DRAW QA PANEL (temporary QA/testing tool, NOT meant to ship)
-- Lets a tester instantly set the active player's current mana or force-draw
-- any number of cards, for repeatedly testing interactions without waiting on
-- natural mana/draw progression.
-- To remove entirely for the final build:
--   1. Delete this whole marked block.
--   2. Delete every line/block tagged "-- DEBUG QA" elsewhere in the file
--      (drawUIHeader for the button/panel drawing, and love.mousepressed for
--      the click handling).
-- Like the Undo system above, this only reads/sets existing state -- it does
-- not change any of the game's normal logic.
-- ============================================================================
local DEBUG_QA_ENABLED = true
local qaPanelOpen = false
local qaManaValue = 0 -- pending value, only applied when "Apply" is clicked
local qaDrawValue = 0
local gameMenuOpen = false
local GAME_MENU_PANEL = {x=248,y=64,w=220,h=170}

-- Shared layout so the drawing code and click-handling code can never drift
-- out of sync with each other (both reference these same values).
local QA_PANEL = {x=18,y=64,w=380,h=200}
local QA_BTN_H=32
local QA_OFFSETS={minus10=10,minus1=50,plus1=206,plus10=246,apply=290}
local QA_ROW_MANA_Y=QA_PANEL.y+34
local QA_ROW_DRAW_Y=QA_PANEL.y+102

-- NOTE: applyQaMana() and applyQaDraw() are defined further down the file
-- (right after drawCard()/activePlayer() exist), not here -- see the matching
-- "DEBUG QA" marker near drawCard() for why.
-- ============================================================================
-- END DEBUG: MANA/DRAW QA PANEL (state/layout only -- functions are below)
-- ============================================================================

-- ============================================================================
-- COLOR PALETTES
-- ============================================================================
-- Rarity colors for card borders and UI elements
local COLORS = {
  -- UI colors for interface elements
  bg={.045,.065,.10}, ink={.93,.95,1}, muted={.55,.62,.72}, panel={.08,.12,.18},
  -- Tavern theme colors for pixel art rendering
  tavernWood={.45,.28,.15}, tavernDark={.25,.15,.08}, tavernLight={.65,.45,.25},
  tavernParchment={.92,.87,.75}, tavernCandle={1,.85,.45}, tavernGold={.9,.7,.2}
}
-- ============================================================================
-- UI CONSTANTS
-- ============================================================================
-- Skill definitions are loaded from data/skills.csv at startup.
local SKILL_ICON,SKILL_DESC,SKILL_ORDER = {},{},{}

-- Screen layout positions for different player zones (bottom = active player, top = opponent)
local LAYOUT = {
  bottom={ chars={x=340,y=585}, areas={x=340,y=750}, equip={x=900,y=750}, deck={x=40,y=760}, grave={x=155,y=760} },
  top={ chars={x=340,y=280}, areas={x=340,y=105}, equip={x=900,y=105}, deck={x=1300,y=60}, grave={x=1185,y=60} }
}

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================

-- Deep copy function for cloning tables recursively
local function deepcopy(v) if type(v)~="table" then return v end local n={} for k,x in pairs(v) do n[k]=deepcopy(x) end return n end

-- String split function for parsing CSV-style data
local function split(s, sep) local t={} for x in (s or ""):gmatch("[^"..sep.."]+") do t[#t+1]=x end return t end

-- String trim function for removing leading/trailing whitespace
local function trim(s) return (s or ""):gsub("^%s*(.-)%s*$", "%1") end
-- CSV parser that handles quoted fields (e.g., "field,with,comma")
parseCSV=function(line)
  local out, field, quoted, i = {}, "", false, 1
  while i<=#line do local c=line:sub(i,i)
    if c=='"' and line:sub(i+1,i+1)=='"' then field=field..'"'; i=i+1 -- Escaped quote
    elseif c=='"' then quoted=not quoted -- Toggle quoted field mode
    elseif c==',' and not quoted then out[#out+1]=trim(field); field="" -- Field separator
    else field=field..c end; i=i+1
  end; out[#out+1]=trim(field); return out
end

-- Parse stat string format "attack+health+speed" (e.g., "3+2+1")
local function stats(s) local a,h,sp=(s or ""):match("(-?%d+)%+(-?%d+)%+(-?%d+)"); return tonumber(a) or 0,tonumber(h) or 0,tonumber(sp) or 0 end

-- Parse skill string format "skill1+skill2+skill3" (e.g., "Flash+Rush")
local function skills(s) local t={} for _,x in ipairs(split(s,"+")) do if x~="---" and x~="" then t[#t+1]=trim(x) end end return t end
function DATA.loadSkillData()
  local data=love.filesystem.read("data/skills.csv");assert(data,"data/skills.csv could not be read")
  for line in data:gmatch("[^\r\n]+") do
    if line:sub(1,1)~="#" and not line:match("^SkillID,") then
      local c=parseCSV(line)
      if c[2] and c[2]~="" then
        SKILL_ICON[c[2]]=c[3]~="" and c[3] or "•";SKILL_DESC[c[2]]=c[4] or ""
        SKILL_ORDER[#SKILL_ORDER+1]={name=c[2],order=tonumber(c[5]) or 9999}
      end
    end
  end
  table.sort(SKILL_ORDER,function(a,b) return a.order<b.order end)
end

-- Future-ready art locations. Optional PNGs can be added without changing card data.
local ASSET_DIRS={cards="assets/cards/",factions="assets/factions/",ui="assets/ui/",backgrounds="assets/backgrounds/"}
local function cardAssetName(name)
  return (name or ""):lower():gsub("[^%w]+","_"):gsub("^_+",""):gsub("_+$","")
end
function DATA.loadOptionalCardArt(card)
  local key=card.artKey~="" and card.artKey or card.name
  local path=ASSET_DIRS.cards..cardAssetName(key)..".png"
  if love.filesystem.getInfo(path) then
    local ok,image=pcall(love.graphics.newImage,path)
    if ok then card.art=image end
  end
end

-- ============================================================================
-- CARD DATA LOADING
-- ============================================================================

-- Load card definitions from CSV file and populate card templates and group pools
local function loadCardData()
  CARD_TEMPLATES, CARD_BY_ID, GROUP_POOLS = {}, {}, {Simple={},Monkey={},Zombie={},Fighter={}}
  local data = love.filesystem.read("data/cards.csv")
  assert(data, "data/cards.csv could not be read")

  for line in data:gmatch("[^\r\n]+") do
    if line:sub(1,1)~="#" and not line:match("^CardID,") then
      local c=parseCSV(line)
      if #c>=8 and c[1]~="" and c[3]~="" then
        local a,h,sp=stats(c[8]) -- Parse attack+health+speed string
        local card={id=c[1],manaCost=tonumber(c[2]) or 0,name=c[3],rarity=c[4]~="" and c[4] or "Basic",type=c[5],race=c[6],group=c[7],attack=a,health=h,speed=sp,skills=skills(c[9]),ability=c[10] or "",description=c[11] or "",artKey=c[12] or ""}
        DATA.loadOptionalCardArt(card)
        CARD_TEMPLATES[card.name]=card
        CARD_BY_ID[card.id]=card
        -- Add card to its group pool for deck building
        if GROUP_POOLS[card.group] then GROUP_POOLS[card.group][#GROUP_POOLS[card.group]+1]=card.name end
      end
    end
  end
end
-- Load deck metadata and explicit card lists from data/decks.csv.
function DATA.loadDeckData()
  DECK_DEFINITIONS,DECK_ORDER={},{}
  local data=love.filesystem.read("data/decks.csv");assert(data,"data/decks.csv could not be read")
  for line in data:gmatch("[^\r\n]+") do
    if line:sub(1,1)~="#" and not line:match("^DeckID,") then
      local c=parseCSV(line);local id=c[1]
      if id and id~="" then
        local deck={id=id,name=c[2],faction=c[3],description=c[4],isPlayable=c[5]=="true",isAI=c[6]=="true",cards={}}
        for token in (c[7] or ""):gmatch("[^|]+") do
          local cardId,quantity=token:match("^([^:]+):(%d+)$")
          quantity=tonumber(quantity)
          assert(cardId and quantity and quantity>0 and CARD_BY_ID[cardId],"Invalid CardList entry in data/decks.csv for deck "..id..": "..token)
          deck.cards[#deck.cards+1]={cardId=cardId,quantity=quantity}
        end
        assert(#deck.cards>0,"Deck "..id.." has no cards in data/decks.csv")
        DECK_DEFINITIONS[id]=deck;DECK_ORDER[#DECK_ORDER+1]=id
      end
    end
  end
  assert(#DECK_ORDER>0,"data/decks.csv contains no deck definitions")
end
-- ============================================================================
-- GAME LOGIC HELPERS
-- ============================================================================

-- Check if a character has a specific skill
local function hasSkill(c, name) for _,s in ipairs(c.skills or {}) do if s==name then return true end end return false end

-- Forward declaration for battlefield character initialization
local initBattlefieldCharacter

-- Remove a skill from a character's skill list
local function removeSkill(c,name) for i,s in ipairs(c.skills or {}) do if s==name then table.remove(c.skills,i); return end end end

-- Get the currently active player
local function activePlayer() return players[activeIndex] end

-- Get the opponent player (player index is either 1 or 2, so 3-index gives the other)
local function opponentPlayer() return players[3-activeIndex] end

-- Create a visual particle effect with text
local function addParticle(x,y,color,text) particles[#particles+1]={x=x,y=y,vx=(math.random()-.5)*100,vy=-45-math.random()*90,life=1,color=color,text=text} end

-- Deal damage to a player with screen shake and visual effects
local function dealDamageToPlayer(p, amount)
  if amount<=0 then return end
  p.health=math.max(0,p.health-amount); shake=math.max(shake,amount*1.5); addParticle(VIRTUAL_WIDTH/2, p.id==activeIndex and 880 or 90,{1,.25,.2},"-"..amount); checkHealthWinCondition()
end
-- ============================================================================
-- EQUIPMENT & CHARACTER STATS
-- ============================================================================

-- Equipment field attach costs by rarity (when moving from field to character)
local EQUIP_RARITY_COST={}
function DATA.loadRarityData()
  local data=love.filesystem.read("data/rarities.csv");assert(data,"data/rarities.csv could not be read")
  for line in data:gmatch("[^\r\n]+") do
    if line:sub(1,1)~="#" and not line:match("^RarityID,") then
      local c=parseCSV(line);local name=c[2]
      if name and name~="" then
        COLORS[name]={tonumber(c[3]) or 0.5,tonumber(c[4]) or 0.5,tonumber(c[5]) or 0.5}
        EQUIP_RARITY_COST[name]=tonumber(c[6]) or EQUIP_RARITY_COST[name] or 1
      end
    end
  end
end
function DATA.loadFactionData()
  local data=love.filesystem.read("data/factions.csv");assert(data,"data/factions.csv could not be read")
  for line in data:gmatch("[^\r\n]+") do
    if line:sub(1,1)~="#" and not line:match("^FactionID,") then
      local c=parseCSV(line);local id=c[1]
      if id and id~="" then COLORS[id]={tonumber(c[3]) or 0.3,tonumber(c[4]) or 0.3,tonumber(c[5]) or 0.3} end
    end
  end
end

-- Calculate equipment attachment cost with ability discounts
local function getEquipCost(c,owner,target,fromField)
  -- Sensei reduces all equipment costs to 0
  for _,x in ipairs((owner and owner.battlefield.characters) or {}) do if x.name=="Sensei" then return 0 end end
  -- Weapons Enthusiast reduces equipment attached to itself to 0
  if target and target.name=="Weapons Enthusiast" then return 0 end
  -- Field equipment uses rarity cost, hand equipment uses mana cost
  return fromField and (EQUIP_RARITY_COST[c.rarity] or 1) or c.manaCost
end

-- Calculate total stat bonuses from all equipped items
local function getEquipmentBonuses(c) local a,h,s=0,0,0 for _,e in ipairs(c.equipped or {}) do a=a+e.attack; h=h+e.health; s=s+e.speed end return a,h,s end
-- Calculate stat bonuses from area cards (parsing ability text for effects)
local function getAreaEffectTotals(p,c)
  local a,h,s=0,0,0
  for _,area in ipairs(p.battlefield.areas) do
    local text=(area.ability.." "..area.name):lower()
    -- Check if area affects this character's group or all characters
    if (area.group==c.group or text:find("all characters")) then
      -- Parse "±N to all stats" patterns
      local n=tonumber(text:match("([+-]%d+)%s+to all stats")) or tonumber(text:match("([+-]%d+)%s+in all stats")) or 0; a=a+n;h=h+n;s=s+n
      -- Parse "±N speed" patterns
      if text:find("speed") then s=s+(tonumber(text:match("([+-]%d+)%s+speed")) or 0) end
      -- Grant parry from area effects
      if text:find("parry") and not hasSkill(c,"Parry") then c.areaParry=true end
    end
  end
  return a,h,s
end
-- Calculate total character stats including equipment, areas, and synergies
local function getCharacterStats(c,p)
  local ea,eh,es=getEquipmentBonuses(c); local aa,ah,as=getAreaEffectTotals(p,c)
  local buff=0 -- Synergy buffs from other characters
  -- Fight Choreographer: each other Fighter gains +2 to all stats
  if c.group=="Fighter" then for _,x in ipairs(p.battlefield.characters) do if x.name=="Fight Choreographer" and x~=c then buff=buff+2 end end end
  -- Turtle synergy: each other Turtle gains +1 to all stats
  if c.name=="Turtle" then for _,x in ipairs(p.battlefield.characters) do if x.name=="Turtle" and x~=c then buff=buff+1 end end end
  return math.max(0,c.attack+ea+aa+buff+(c.rallyBonus or 0)), math.max(0,c.currentHealth+ah+buff), math.max(0,c.speed+es+as+buff+(c.rallyBonus or 0))
end

-- Update rally bonuses (Rally: +1 to all stats if 3+ of same group are present)
local function updateRallyBonuses(p)
  local count={} for _,c in ipairs(p.battlefield.characters) do if hasSkill(c,"Rally") then count[c.group]=(count[c.group] or 0)+1 end end
  for _,c in ipairs(p.battlefield.characters) do c.rallyBonus=(hasSkill(c,"Rally") and (count[c.group] or 0)>=3) and 1 or 0 end
end
-- Trigger Evolve skill (+3 to all stats, one-time only)
local function triggerEvolve(c) if hasSkill(c,"Evolve") and not c.hasEvolved then c.attack=c.attack+3;c.currentHealth=c.currentHealth+3;c.speed=c.speed+3;c.hasEvolved=true;removeSkill(c,"Evolve") end end

-- Transform character into a different card type, preserving equipment and state
local function transformCharacter(c,newName)
  local t=CARD_TEMPLATES[newName]; if not t then return end
  local oldHealth=c.currentHealth; local n=deepcopy(t); n.currentHealth=math.max(1,oldHealth+(n.health-c.health)); n.equipped=c.equipped or {}; n.hasAttacked=c.hasAttacked; n.levelUpCount=c.levelUpCount or 0; n.combatSurvived=0
  for k,v in pairs(n) do c[k]=v end
  c.baseAttack,c.baseHealth,c.baseSpeed=c.attack,c.health,c.speed
  addParticle(VIRTUAL_WIDTH/2,500,{.4,.9,1},"TRANSFORM!")
end

-- Handle Level Up skill (+1 to all stats, max 3 times, then transform if applicable)
local function levelUp(c)
  if hasSkill(c,"Level Up") and (c.levelUpCount or 0)<3 then c.attack=c.attack+1;c.currentHealth=c.currentHealth+1;c.speed=c.speed+1;c.levelUpCount=(c.levelUpCount or 0)+1
    if c.levelUpCount>=3 then removeSkill(c,"Level Up"); if c.name=="White Belt Student" then transformCharacter(c,"Black Belt Student") end end
  end
end
-- Handle Signal skill effects (immediate effects when character enters battlefield)
local function triggerSignal(c,owner)
  local text=(c.ability or ""):lower()
  if not hasSkill(c,"Signal") then return false end
  -- Target selection signals
  if text:find("target") or c.name=="Simple Barkeep" then signalTargetCard={card=c,owner=owner}; return true end
  -- Mana manipulation effects
  if c.name=="Mana Horder" then local foe=players[3-owner.id];owner.manaMax=owner.manaMax+1;owner.mana=owner.mana+1;foe.manaMax=math.max(0,foe.manaMax-1);foe.mana=math.min(foe.mana,foe.manaMax)
  -- Deck searching effects
  elseif c.name=="Monkey Apprentice" then for i,n in ipairs(owner.deck) do if n.name=="Banana" then table.insert(owner.hand,table.remove(owner.deck,i));break end end
  -- Stat bonuses based on other characters
  elseif c.name=="Orangutan" then local n=0 for _,x in ipairs(owner.battlefield.characters) do if x.group=="Monkey" and x~=c then n=n+1 end end;c.currentHealth=c.currentHealth+n
  elseif c.name=="Simpler Farmer" then local n=0 for _,x in ipairs(owner.battlefield.characters) do if x.name=="Simple Farmer" then n=n+1 end end;c.attack=c.attack+n;c.speed=c.speed+n
  -- Character deployment effects
  elseif c.name=="Primate" then
    local found=0
    for i=#owner.deck,1,-1 do
      local n=owner.deck[i]
      if n.group=="Monkey" and n.name~=c.name and n.manaCost<=2 and #owner.battlefield.characters<MAX_FIELD_CHARACTERS then
        local monkey=table.remove(owner.deck,i);initBattlefieldCharacter(monkey,owner);owner.battlefield.characters[#owner.battlefield.characters+1]=monkey;found=found+1
        if found>=2 then break end
      end
    end
  end
  return false
end
local function applySignalToTarget(target)
  local state=signalTargetCard; if not state or not target then return end
  if DEBUG_UNDO_ENABLED then saveUndoSnapshot() end -- DEBUG UNDO
  local c=state.card; local text=(c.ability or ""):lower()
  -- Cloak: cannot be targeted by spells (click is ignored, pick another target)
  if state.spell and hasSkill(target,"Cloak") then addParticle(VIRTUAL_WIDTH/2,500,{.6,.7,1},"CLOAKED!");return end
  if c.name=="Simplify" then target.attack,target.currentHealth,target.speed=1,1,1
  elseif c.name=="Sweep the Leg" then target.speed=math.max(0,target.speed-1)
  elseif c.name=="Crane Kick" then dealDamageToCharacter(target,7,state.owner)
  elseif c.name=="Simple Wizard" then dealDamageToCharacter(target,2,state.owner)
  elseif c.name=="Haunt the Living" then if not hasSkill(target,"Reanimate") then target.skills[#target.skills+1]="Reanimate";target.reanimated=false end
  elseif c.name=="Peel" then
    local monkeys=0 for _,x in ipairs(state.owner.battlefield.characters) do if x.group=="Monkey" then monkeys=monkeys+1 end end
    dealDamageToCharacter(target,monkeys>=3 and 2 or 1,state.owner)
  elseif c.name=="Banana" then
    target.currentHealth=target.currentHealth+1
    for i,x in ipairs(state.owner.deck) do if x.name=="Peel" then table.insert(state.owner.hand,table.remove(state.owner.deck,i));break end end
  elseif c.name=="Plaguemancer" or c.name=="Infection" then
    local foe=players[3-state.owner.id]
    if target.owner==foe then
      for i,x in ipairs(foe.battlefield.characters) do if x==target then table.remove(foe.battlefield.characters,i);break end end
      target.owner=state.owner;target.group="Zombie"
      if c.name=="Plaguemancer" and not hasSkill(target,"Reanimate") then target.skills[#target.skills+1]="Reanimate";target.reanimated=false end
      target.rallyBonus=0 -- reset rally bonus since it's on a new field
      state.owner.battlefield.characters[#state.owner.battlefield.characters+1]=target
      updateRallyBonuses(state.owner);updateRallyBonuses(foe)
    end
  elseif c.name=="Soul Suction" then
    state.owner.health=math.min(state.owner.maxHealth,state.owner.health+target.attack+math.max(0,target.currentHealth)+target.speed)
    dealDamageToCharacter(target,99999,state.owner)
  elseif c.name=="Death's Grasp" then
    local q=target.owner -- destroys directly, ignoring skills like Reanimate
    for i,x in ipairs(q.battlefield.characters) do if x==target then table.remove(q.battlefield.characters,i);q.graveyard[#q.graveyard+1]=target;updateRallyBonuses(q);break end end
  elseif c.name=="Simple Barkeep" or text:find("gains %+1 health") then target.currentHealth=target.currentHealth+1
  elseif text:find("lose") then dealDamageToCharacter(target,tonumber(text:match("loses %-?(%d+) health")) or 1,state.owner) end
  signalTargetCard=nil
end
initBattlefieldCharacter=function(c,owner)
  c.baseAttack,c.baseHealth,c.baseSpeed=c.attack,c.health,c.speed;c.currentHealth=c.health;c.equipped={};c.hasAttacked=not hasSkill(c,"Rush");c.owner=owner;c.levelUpCount=0;c.combatSurvived=0;c.reanimated=false
  -- Entrance animation scales with mana cost: 1=none, 2=tiny wiggle, 3=bigger wiggle,
  -- 4=flip, 5=spin, 6=flip+spin, 7+=screenshake (see drawFieldCard for the wiggle/flip/spin render)
  local cost=c.manaCost or 0
  if cost>=7 then
    shake=math.max(shake,14) -- a heavy-cost arrival shakes the whole board
  elseif cost>=2 then
    c.spawnFX=1
    -- Bigger/combined motions (flip, spin, flip+spin) need more time to read clearly
    -- than a quick wiggle, so they decay (play out) more slowly.
    c.spawnFXRate = (cost==6 and 1.2) or (cost==5 and 1.4) or (cost==4 and 1.6) or 2.2
  end
  if c.name=="Zombombadier" then
    local d=c.attack+c.health+c.speed
    for _,q in ipairs(players) do
      local snapshot={} for _,x in ipairs(q.battlefield.characters) do if x~=c then snapshot[#snapshot+1]=x end end
      for _,x in ipairs(snapshot) do dealDamageToCharacter(x,d,owner) end
      dealDamageToPlayer(q,d)
    end
  end
  if c.name=="Master Rat" then
    for _=1,4 do
      if #owner.battlefield.characters>=MAX_FIELD_CHARACTERS then break end
      local turtle={name="Turtle",rarity="Basic",type="Character",race="Animal",group="Fighter",manaCost=0,attack=1,health=1,speed=1,skills={},ability="Gain +1 to each stat for every other Turtle on the field",description=""}
      initBattlefieldCharacter(turtle,owner);owner.battlefield.characters[#owner.battlefield.characters+1]=turtle
    end
  elseif c.name=="Simple Farmer" then
    -- When played: search the deck for another Simple Farmer and add it to hand
    for i,n in ipairs(owner.deck) do
      if n.name=="Simple Farmer" then table.insert(owner.hand,table.remove(owner.deck,i));break end
    end
    local farmers=1
    for _,x in ipairs(owner.battlefield.characters) do if x.name=="Simple Farmer" then farmers=farmers+1 end end
    if farmers>=3 and #owner.battlefield.characters<MAX_FIELD_CHARACTERS then
      for i,n in ipairs(owner.deck) do
        if n.name=="Simpler Farmer" then local farmer=table.remove(owner.deck,i);initBattlefieldCharacter(farmer,owner);owner.battlefield.characters[#owner.battlefield.characters+1]=farmer;break end
      end
    end
  end
  updateRallyBonuses(owner); triggerSignal(c,owner)
end
local function removeCharacter(p,index)
  local c=table.remove(p.battlefield.characters,index); if c then p.graveyard[#p.graveyard+1]=c; updateRallyBonuses(p) end
end
-- Find a character's current on-screen center position (for damage numbers / FX).
-- Falls back to screen center if the character can't be located (e.g. already removed).
local function characterScreenPos(c)
  local p=c.owner; if not p then return VIRTUAL_WIDTH/2,500 end
  local side=(p==activePlayer()) and "bottom" or "top"; local l=LAYOUT[side]
  for i,x in ipairs(p.battlefield.characters) do
    if x==c then return l.chars.x+(i-1)*110+cardW/2, l.chars.y+cardH/2 end
  end
  return VIRTUAL_WIDTH/2,500
end
-- Decay per-character combat feedback effects (hit flash, hit shake, attack lunge)
local function updateCombatFX(dt)
  for _,p in ipairs(players) do
    for _,c in ipairs(p.battlefield.characters) do
      if c.hitFlash and c.hitFlash>0 then c.hitFlash=math.max(0,c.hitFlash-dt*3.2) end
      if c.hitShake and c.hitShake>0 then c.hitShake=math.max(0,c.hitShake-dt*4) end
      if c.attackLunge and c.attackLunge>0 then c.attackLunge=math.max(0,c.attackLunge-dt*3.5) end
      if c.spawnFX and c.spawnFX>0 then c.spawnFX=math.max(0,c.spawnFX-dt*(c.spawnFXRate or 2.2)) end
    end
  end
end
function dealDamageToCharacter(c,amount,source)
  if not c or amount<=0 then return end
  local px,py=characterScreenPos(c)
  c.currentHealth=c.currentHealth-amount; addParticle(px,py,{1,.35,.2},"-"..amount);shake=math.max(shake,amount)
  c.hitFlash=1;c.hitShake=1 -- trigger visual hit feedback on the character card
  if c.currentHealth<=0 then
    local p=c.owner
    if hasSkill(c,"Reanimate") and not c.reanimated then
      c.reanimated=true;removeSkill(c,"Reanimate");c.currentHealth=c.baseHealth;c.attack=c.baseAttack;c.speed=c.baseSpeed
      if c.name=="Hungry Corpse" then c.attack=c.attack+1;c.currentHealth=c.currentHealth+1;c.speed=c.speed+1 end
      triggerEvolve(c) -- "After returning from the Graveyard to the Field, Evolve"
      addParticle(720,500,{.5,1,.5},"REANIMATE")
    else for i,x in ipairs(p.battlefield.characters) do if x==c then removeCharacter(p,i);break end end end
  elseif c.name=="Gorilla" then c.attack=c.attack+1;c.speed=c.speed+1;addParticle(720,470,{1,.9,.3},"+1 ATK/SPD")
  end
end
local function recordCombatSurvival(c)
  if c and c.currentHealth>0 and c.name=="Black Belt Student" then
    c.combatSurvived=(c.combatSurvived or 0)+1
    if c.combatSurvived>=3 then transformCharacter(c,"5th Degree Master") end
  end
end
local function resolveCharacterAttack(ai,targetP,ti)
  local p=activePlayer();local a=p.battlefield.characters[ai]; if not a or a.hasAttacked then return end
  if hasSkill(a,"Tower") then return end
  if DEBUG_UNDO_ENABLED then saveUndoSnapshot() end -- DEBUG UNDO
  local target=ti and targetP.battlefield.characters[ti] or nil
  -- Challenge: enemies are forced to attack the Challenge character
  for i,c in ipairs(targetP.battlefield.characters) do if hasSkill(c,"Challenge") then target=c;ti=i;break end end
  a.hasAttacked=true; a.attackLunge=1; local aa,_,as=getCharacterStats(a,p)
  if not target then dealDamageToPlayer(targetP,aa);return end
  local ta,_,ts=getCharacterStats(target,targetP)
  if hasSkill(target,"Parry") or target.areaParry then ta=ta*2 end -- Parry: double damage when defending
  if as>=ts then
    local hpBefore=target.currentHealth
    dealDamageToCharacter(target,aa,p)
    if hasSkill(a,"Overwhelm") and aa>hpBefore then dealDamageToPlayer(targetP,aa-hpBefore) end
    if target.currentHealth>0 and a.currentHealth>0 then dealDamageToCharacter(a,ta,targetP) end
  else
    dealDamageToCharacter(a,ta,targetP)
    if a.currentHealth>0 then
      local hpBefore=target.currentHealth
      dealDamageToCharacter(target,aa,p)
      if hasSkill(a,"Overwhelm") and aa>hpBefore then dealDamageToPlayer(targetP,aa-hpBefore) end
    end
  end
  recordCombatSurvival(a);recordCombatSurvival(target)
end
function checkHealthWinCondition() for _,p in ipairs(players) do if p.health<=0 then gameOver=true;winner=players[3-p.id] end end end
function checkDeckOutWinCondition(p) if #p.deck==0 then gameOver=true;winner=players[3-p.id] end end
local function applyAreaEffectToExistingCharacters(p,area)
  if area.name=="Whirlpool" then
    local snapshot={} for _,x in ipairs(p.battlefield.characters) do snapshot[#snapshot+1]=x end
    for _,c in ipairs(snapshot) do dealDamageToCharacter(c,1,p);c.speed=c.speed-1 end
  end
end

-- ============================================================================
-- PLAYER MANAGEMENT
-- ============================================================================

-- Create a new player with initial state
local function makePlayer(id,group,deckId)
  return {id=id,name="Player "..id,color=id==1 and {.25,.6,1} or {1,.3,.35},assignedGroup=group,deckId=deckId,mana=0,manaMax=0,turnsPlayed=0,hasDrawn=false,deck={},hand={},graveyard={},health=STARTING_PLAYER_HEALTH,maxHealth=STARTING_PLAYER_HEALTH,displayHealth=STARTING_PLAYER_HEALTH,battlefield={characters={},areas={},equipments={}}}
end

-- Create a shuffled deck from an explicit deck definition.
local function shuffledDeck(deckId)
  local definition=DECK_DEFINITIONS[deckId];local d={}
  if definition then
    for _,entry in ipairs(definition.cards) do
      for _=1,entry.quantity do d[#d+1]=deepcopy(CARD_BY_ID[entry.cardId]) end
    end
  else
    -- Compatibility fallback for old callers that pass a faction name.
    for _,name in ipairs(GROUP_POOLS[deckId] or {}) do d[#d+1]=deepcopy(CARD_TEMPLATES[name]) end
  end
  for i=#d,2,-1 do local j=math.random(i);d[i],d[j]=d[j],d[i] end return d
end

-- Draw a card from deck to hand (check for deck out win condition)
local function drawCard(p)
  if #p.deck==0 then checkDeckOutWinCondition(p);return end;p.hand[#p.hand+1]=table.remove(p.deck)
end
-- DEBUG QA: apply functions for the mana/draw QA panel (state/layout for this
-- panel is defined near the top of the file, right after the Undo system --
-- these two functions have to live here instead, since they need activePlayer()
-- and drawCard() above to already be in scope). Remove alongside that block.
function applyQaMana()
  if DEBUG_UNDO_ENABLED then saveUndoSnapshot() end
  activePlayer().mana=math.max(0,qaManaValue)
end
function applyQaDraw()
  if DEBUG_UNDO_ENABLED then saveUndoSnapshot() end
  for _=1,math.max(0,qaDrawValue) do drawCard(activePlayer()) end
end
-- ============================================================================
-- TURN MANAGEMENT
-- ============================================================================

-- Start a new turn: increment mana, reset flags, and prepare for draw phase
local function startTurn(p)
  p.turnsPlayed=p.turnsPlayed+1
  p.manaMax=p.manaMax+MANA_GROWTH_PER_TURN
  p.mana=p.manaMax -- Refill mana
  p.hasDrawn=false -- Require card draw
  resetCharacterAttackFlags(p) -- Reset attack permissions
end
function resetPlayerState(p,deckId)
  local definition=DECK_DEFINITIONS[deckId];local group=definition and definition.faction or deckId
  local n=makePlayer(p.id,group,deckId);for k,v in pairs(n) do p[k]=v end;p.deck=shuffledDeck(deckId)
  for _=1,STARTING_HAND_SIZE do drawCard(p) end
end
function resetGame()
  local selected=DECK_DEFINITIONS[selectedDeck] or DECK_DEFINITIONS[DECK_ORDER[1]]
  assert(selected,"Selected deck is not defined in data/decks.csv: "..tostring(selectedDeck))
  local opponentId
  repeat opponentId=DECK_ORDER[math.random(#DECK_ORDER)] until opponentId~=selected.id or #DECK_ORDER==1
  local opponent=DECK_DEFINITIONS[opponentId]
  players={makePlayer(1,selected.faction,selected.id),makePlayer(2,opponent.faction,opponent.id)}
  for _,p in ipairs(players) do p.deck=shuffledDeck(p.deckId);for _=1,STARTING_HAND_SIZE do drawCard(p) end end
  activeIndex,phaseIndex,round,gameOver,winner=1,1,1,false,nil;selectedAttacker=nil
  startTurn(players[1])
end
-- Calculate card play cost (Shaolin Warrior cost reduces by total cards in play)
local function getCardPlayCost(c)
  if c.name~="Shaolin Warrior" then return c.manaCost end
  local count=0
  for _,p in ipairs(players) do count=count+#p.battlefield.characters+#p.battlefield.equipments end
  return math.max(0,c.manaCost-count)
end

-- Check if a card can be played (draw requirement, mana cost, phase restriction)
local function canPlay(c)
  if not c or not activePlayer().hasDrawn then return false end
  local cost=c.type=="Equipment" and getEquipCost(c,activePlayer(),nil) or getCardPlayCost(c)
  local playablePhase=phaseIndex==2 or (phaseIndex==3 and hasSkill(c,"Flash"))
  return activePlayer().mana>=cost and playablePhase
end
-- Trigger effects when equipment enters the field (White Belt Student level up)
local function triggerEquipmentFieldEntry(p)
  for _,x in ipairs(p.battlefield.characters) do if x.name=="White Belt Student" then levelUp(x) end end
end

-- Attach equipment to character, paying cost and applying health bonus
local function attachEquipment(p,c,target,fromField)
  local cost=getEquipCost(c,p,target,fromField)
  if p.mana<cost then return false end
  p.mana=p.mana-cost;target.equipped[#target.equipped+1]=c
  target.currentHealth=target.currentHealth+(c.health or 0) -- Equipment health is current health, not max
  return true
end

-- Attach equipment from field row to character
local function attachFieldEquipment(p,index,target)
  local c=p.battlefield.equipments[index]
  if not c or not p.hasDrawn or not (phaseIndex==2 or (phaseIndex==3 and hasSkill(c,"Flash"))) then return end
  if DEBUG_UNDO_ENABLED then saveUndoSnapshot() end -- DEBUG UNDO
  if not attachEquipment(p,c,target,true) then return end
  table.remove(p.battlefield.equipments,index)
end
-- Main card playing function: handles different card types and play modes
local function playCard(index,target,placeOnField)
  local p=activePlayer();local c=p.hand[index];if not canPlay(c) then return end
  if DEBUG_UNDO_ENABLED then saveUndoSnapshot() end -- DEBUG UNDO
  if c.type=="Equipment" then
    -- Place equipment on field row
    if placeOnField then
      if #p.battlefield.equipments>=MAX_FIELD_EQUIPMENT or p.mana<c.manaCost then return end
      p.mana=p.mana-c.manaCost;table.remove(p.hand,index);p.battlefield.equipments[#p.battlefield.equipments+1]=c;triggerEquipmentFieldEntry(p);return
    end
    -- Attach equipment directly to character
    if not target then equipTargetCard={card=c,index=index,fromField=false};return end
    if not attachEquipment(p,c,target,false) then return end
    table.remove(p.hand,index);triggerEquipmentFieldEntry(p)
  elseif c.type=="Character" then
    -- Play character to battlefield (Flash cards can be played in Battle phase)
    if phaseIndex==3 and not hasSkill(c,"Flash") then return end
    if #p.battlefield.characters>=MAX_FIELD_CHARACTERS then return end -- battlefield row is full
    p.mana=p.mana-getCardPlayCost(c);table.remove(p.hand,index);initBattlefieldCharacter(c,p);p.battlefield.characters[#p.battlefield.characters+1]=c
    -- Start play animation: fly from drop point to battlefield slot
    local slotIdx=#p.battlefield.characters
    local destX=LAYOUT.bottom.chars.x+(slotIdx-1)*110
    local destY=LAYOUT.bottom.chars.y
    c.playFlying=true -- hide from field rendering while animating
    playAnimations[#playAnimations+1]={card=c,progress=0,startX=mouseX-cardW/2,startY=mouseY-cardH/2,endX=destX,endY=destY}
  elseif c.type=="Area" then
    -- Play area card to affect all characters
    if #p.battlefield.areas>=MAX_FIELD_AREAS then return end
    p.mana=p.mana-c.manaCost;table.remove(p.hand,index);p.battlefield.areas[#p.battlefield.areas+1]=c
    for _,q in ipairs(players) do applyAreaEffectToExistingCharacters(q,c) end
  else
    if phaseIndex==3 and not hasSkill(c,"Flash") then return end;p.mana=p.mana-c.manaCost;table.remove(p.hand,index);p.graveyard[#p.graveyard+1]=c
    local txt=(c.ability.." "..c.name):lower()
    if txt:find("all characters") then
      local dmg=c.name=="Fire Storm" and 3 or 1
      for _,q in ipairs(players) do
        local snapshot={} for _,x in ipairs(q.battlefield.characters) do snapshot[#snapshot+1]=x end
        for _,x in ipairs(snapshot) do dealDamageToCharacter(x,dmg,p) end
        dealDamageToPlayer(q,dmg)
      end
    elseif c.name=="Rotten Hand" then local n=#p.hand;for i=n,1,-1 do p.graveyard[#p.graveyard+1]=table.remove(p.hand,i) end;for _=1,3 do drawCard(p) end
    elseif c.name=="Rotten Finger" then if #p.hand>0 then p.graveyard[#p.graveyard+1]=table.remove(p.hand,1);drawCard(p) end
    elseif c.name=="Herd" then for _=1,3 do if #p.battlefield.characters<MAX_FIELD_CHARACTERS then local f=deepcopy(CARD_TEMPLATES["Simple Farmer"]);initBattlefieldCharacter(f,p);p.battlefield.characters[#p.battlefield.characters+1]=f end end
    elseif txt:find("target") then signalTargetCard={card=c,owner=p,spell=true} end
  end
end
function resetCharacterAttackFlags(p)
  for _,c in ipairs(p.battlefield.characters) do c.hasAttacked=false end
end
function endPhase()
  local p=activePlayer()
  for _,c in ipairs(p.battlefield.characters) do
    if c.name=="Simple Defender" then c.currentHealth=c.currentHealth+2 end
    if c.name=="Banana Tree" then for i,x in ipairs(p.deck) do if x.name=="Banana" then table.insert(p.hand,table.remove(p.deck,i));break end end end
    if c.name=="Sneaky Skinbag" then
      local zombies=0 for _,x in ipairs(p.battlefield.characters) do if x.group=="Zombie" and x~=c then zombies=zombies+1 end end
      c.currentHealth=c.currentHealth+zombies
      if #p.battlefield.characters<MAX_FIELD_CHARACTERS and CARD_TEMPLATES["Reanimated Corpse"] then
        local corpse=deepcopy(CARD_TEMPLATES["Reanimated Corpse"]);initBattlefieldCharacter(corpse,p);p.battlefield.characters[#p.battlefield.characters+1]=corpse
      end
    end
  end
end
function advancePhase()
  if gameOver or drawAnimation.active then return end
  if phaseIndex==1 then return end
  if phaseIndex<4 then phaseIndex=phaseIndex+1 end
end
function endTurn()
  if gameOver or drawAnimation.active then return end
  if DEBUG_UNDO_ENABLED then saveUndoSnapshot() end -- DEBUG UNDO
  endPhase()
  activeIndex=3-activeIndex;phaseIndex=1;round=round+1;selectedAttacker=nil;signalTargetCard=nil;equipTargetCard=nil;draggedCard=nil;dragIndex=nil
  startTurn(activePlayer());transition=1
  -- Trigger turn banner
  turnBanner={active=true,progress=0,text=activePlayer().name:upper().."'S TURN",duration=1.4}
end

local function rect(x,y,w,h,col,r) love.graphics.setColor(col);love.graphics.rectangle("fill",math.floor(x),math.floor(y),math.floor(w),math.floor(h),r or 0,r or 0) end
local function text(s,x,y,limit,align,font) love.graphics.setFont(font or fonts.small);love.graphics.setColor(COLORS.ink);love.graphics.printf(s,math.floor(x),math.floor(y),math.floor(limit or 300),align or "left") end
local function roundedOutline(x,y,w,h,col,lw) love.graphics.setColor(col);love.graphics.setLineWidth(lw or 2);love.graphics.rectangle("line",math.floor(x),math.floor(y),math.floor(w),math.floor(h),0,0) end
local function textWithShadow(s,x,y,limit,align,font,shadowColor,shadowOffset)
  love.graphics.setFont(font or fonts.small)
  local ox=shadowOffset or 2
  local oy=shadowOffset or 2
  love.graphics.setColor(shadowColor or {0,0,0,.5})
  love.graphics.printf(s,x+ox,y+oy,limit or 300,align or "left")
  love.graphics.setColor(COLORS.ink)
  love.graphics.printf(s,x,y,limit or 300,align or "left")
end
local function groupColor(c) return COLORS[c.group] or {.3,.35,.45} end
-- Paper card foundation. It is intentionally flat and quiet until custom
-- illustrations are available; no procedural watercolor is applied here.
local CARD_PAPER={.78,.72,.61}
local CARD_INK={.10,.075,.055}
local function cardText(s,x,y,limit,align,font,color)
  love.graphics.setFont(font or fonts.tiny);love.graphics.setColor(color or CARD_INK)
  love.graphics.printf(s,math.floor(x),math.floor(y),math.floor(limit or 300),align or "left")
end
local function drawCardStat(s,x,y,color)
  love.graphics.setFont(fonts.tiny);love.graphics.setColor(1,1,1,.75);love.graphics.print(s,x+1,y+1)
  love.graphics.setColor(color or CARD_INK);love.graphics.print(s,x,y)
end
-- Small, readable faction medallions. These are procedural placeholders for
-- future PNG symbols in assets/factions/.
local function drawFactionMedallion(x,y,r,group)
  local fill=COLORS[group] or {.35,.35,.35}
  love.graphics.setColor(0,0,0,.22);love.graphics.circle("fill",x+1,y+1,r+1)
  love.graphics.setColor(fill[1],fill[2],fill[3],1);love.graphics.circle("fill",x,y,r)
  love.graphics.setColor(CARD_INK[1],CARD_INK[2],CARD_INK[3],.9);love.graphics.setLineWidth(1);love.graphics.circle("line",x,y,r)
  love.graphics.setColor(.96,.90,.76,1);love.graphics.setLineWidth(1.5)
  if group=="Simple" then
    love.graphics.line(x,y+r*.55,x,y-r*.45)
    love.graphics.ellipse("fill",x-r*.34,y-r*.38,r*.42,r*.22)
    love.graphics.ellipse("fill",x+r*.30,y-r*.05,r*.42,r*.22)
  elseif group=="Monkey" then
    love.graphics.circle("fill",x,y+r*.18,r*.31)
    love.graphics.circle("fill",x-r*.34,y-r*.18,r*.22);love.graphics.circle("fill",x+r*.34,y-r*.18,r*.22)
    love.graphics.circle("fill",x-r*.12,y-r*.42,r*.16);love.graphics.circle("fill",x+r*.12,y-r*.42,r*.16)
  elseif group=="Zombie" then
    love.graphics.rectangle("fill",x-r*.42,y-r*.34,r*.84,r*.66,2,2)
    love.graphics.rectangle("fill",x-r*.25,y-r*.12,r*.14,r*.16);love.graphics.rectangle("fill",x+r*.11,y-r*.12,r*.14,r*.16)
    love.graphics.line(x-r*.22,y+r*.25,x+r*.22,y+r*.25)
  elseif group=="Fighter" then
    love.graphics.line(x-r*.48,y-r*.48,x+r*.38,y+r*.38);love.graphics.line(x+r*.48,y-r*.48,x-r*.38,y+r*.38)
    love.graphics.line(x-r*.18,y-r*.34,x-r*.34,y-r*.18);love.graphics.line(x+r*.18,y-r*.34,x+r*.34,y-r*.18)
  end
  love.graphics.setLineWidth(1)
end
local function drawPaperCardSurface(x,y,w,h,c)
  rect(x,y,w,h,CARD_PAPER,8)
  love.graphics.setColor(.20,.14,.09,.12);love.graphics.setLineWidth(1)
  love.graphics.rectangle("line",x+2,y+2,w-4,h-4,7,7)
end
local function drawSimpleFarmerPrototype(x,y,w,h)
  local ink={.18,.25,.12}
  love.graphics.setColor(.72,.54,.25,.55);love.graphics.rectangle("fill",x+5,y+h*.72,w-10,h*.16,3,3)
  love.graphics.setColor(ink);love.graphics.setLineWidth(2)
  love.graphics.line(x+w*.5,y+h*.72,x+w*.5,y+h*.30)
  love.graphics.ellipse("fill",x+w*.40,y+h*.28,w*.25,h*.18)
  love.graphics.ellipse("fill",x+w*.60,y+h*.42,w*.25,h*.18)
  love.graphics.line(x+w*.5,y+h*.72,x+w*.30,y+h*.88);love.graphics.line(x+w*.5,y+h*.72,x+w*.70,y+h*.88)
  love.graphics.setLineWidth(1)
end
local function drawCardIllustrationWindow(x,y,w,h,c)
  love.graphics.setColor(.18,.14,.11,.16);love.graphics.rectangle("fill",x+2,y+3,w,h,5,5)
  love.graphics.setColor(.93,.86,.71,1);love.graphics.rectangle("fill",x,y,w,h,5,5)
  -- Optional card art is automatically loaded from assets/cards/<card_name>.png.
  if c.art then
    local iw,ih=c.art:getWidth(),c.art:getHeight();local fit=math.min((w-4)/iw,(h-4)/ih)
    love.graphics.setColor(1,1,1,1);love.graphics.draw(c.art,x+(w-iw*fit)/2,y+(h-ih*fit)/2,0,fit,fit)
  elseif c.name=="Simple Farmer" then
    -- Temporary polished prototype while the first custom illustration is made.
    drawSimpleFarmerPrototype(x,y,w,h)
  end
  love.graphics.setColor(.16,.12,.09,.55);love.graphics.setLineWidth(1)
  love.graphics.rectangle("line",x,y,w,h,5,5)
end
local function drawHighlight(x,y,w,h,color) love.graphics.setColor(color[1],color[2],color[3],.28);love.graphics.rectangle("fill",x,y,w,h,8,8);roundedOutline(x,y,w,h,color,3) end
-- Themed wood-bordered panel used for overlays (card detail, equipment detail,
-- graveyard view) so they match the tavern aesthetic instead of plain flat boxes.
-- The interior stays dark (not parchment) so the existing light-colored text()
-- helper used throughout these overlays stays readable without changes.
local function drawThemedPanel(x,y,w,h,accentColor)
  accentColor = accentColor or COLORS.tavernGold
  love.graphics.setColor(0,0,0,.4);love.graphics.rectangle("fill",x+8,y+10,w,h,14,14)
  love.graphics.setColor(COLORS.tavernWood);love.graphics.rectangle("fill",x,y,w,h,14,14)
  love.graphics.setColor(.10,.06,.09,.97);love.graphics.rectangle("fill",x+10,y+10,w-20,h-20,10,10)
  love.graphics.setColor(accentColor);love.graphics.setLineWidth(4);love.graphics.rectangle("line",x+10,y+10,w-20,h-20,10,10)
  love.graphics.setColor(accentColor)
  for _,corner in ipairs({{x+6,y+6},{x+w-28,y+6},{x+6,y+h-28},{x+w-28,y+h-28}}) do love.graphics.rectangle("fill",corner[1],corner[2],22,22) end
end
local function drawOutlinedStat(s,x,y,color) love.graphics.setFont(fonts.tiny);love.graphics.setColor(0,0,0);love.graphics.print(s,x+1,y+1);love.graphics.setColor(color or COLORS.ink);love.graphics.print(s,x,y) end
-- Simple static rarity edge. Rarity is communicated by the edge color, while
-- the rarity label itself is only shown when the card is opened.
local function drawCardFrameDecor(x,y,w,h,rarity)
  local rarityColor=COLORS[rarity] or COLORS.Basic
  love.graphics.setColor(CARD_INK[1],CARD_INK[2],CARD_INK[3],.36)
  love.graphics.setLineWidth(1)
  love.graphics.rectangle("line",x+4,y+4,w-8,h-8,5,5)
  love.graphics.setColor(rarityColor[1],rarityColor[2],rarityColor[3],.95)
  love.graphics.setLineWidth(2)
  love.graphics.rectangle("line",x+1,y+1,w-2,h-2,5,5)
end
local function drawManaCrystal(x,y,p)
  local pulse=.7+.3*math.sin(time*4);love.graphics.setColor(.95,.62,.18,.16*pulse);love.graphics.circle("fill",x,y,28);love.graphics.setColor(.78,.42,.12);love.graphics.polygon("fill",x,y-16,x+14,y,x,y+16,x-14,y);love.graphics.setColor(.99,.78,.26);love.graphics.polygon("fill",x,y-10,x+8,y,x,y+10,x-8,y);text(tostring(p.mana),x-12,y-7,24,"center",fonts.small);text("MANA "..p.mana.."/"..p.manaMax,x-45,y+24,90,"center",fonts.tiny)
end
local function drawDeckStack(p,x,y)
  for i=3,0,-1 do rect(x+i*2,y-i*2,cardW,cardH,{.18,.09,.04}) end;roundedOutline(x,y,cardW,cardH,COLORS[p.assignedGroup],2);text("DECK\n"..#p.deck,x,y+48,cardW,"center",fonts.small)
end
local function drawDiscardPile(p,x,y)
  rect(x,y,cardW,cardH,{.11,.06,.03});roundedOutline(x,y,cardW,cardH,{.54,.42,.31},2);text("GRAVE\n"..#p.graveyard,x,y+48,cardW,"center",fonts.small)
end
local function drawFieldCard(c,p,x,y,side)
  local bob=math.sin(time*2+x*.01)*2; y=y+bob
  -- Attack lunge: card hops toward the opposing side, then eases back
  local lunge=c.attackLunge or 0
  if lunge>0 then
    local ease=math.sin(lunge*math.pi) -- rises then falls back to 0 over the lunge duration
    y=y+(side=="bottom" and -1 or 1)*ease*22
  end
  -- Hit shake: brief random jitter when the character takes damage
  local shakeAmt=(c.hitShake or 0)
  if shakeAmt>0 then x=x+(math.random()-.5)*shakeAmt*10; y=y+(math.random()-.5)*shakeAmt*10 end
  -- Entrance animation, keyed off mana cost (1=none, 2/3=wiggle, 4=flip, 5=spin, 6=flip+spin)
  local spawn=c.spawnFX or 0
  local spawnRot,spawnScaleX=0,1
  if spawn>0 then
    local cost=c.manaCost or 0
    if cost==2 then spawnRot=math.sin(spawn*math.pi*6)*.05*spawn -- tiny wiggle
    elseif cost==3 then spawnRot=math.sin(spawn*math.pi*6)*.16*spawn -- slightly bigger wiggle
    elseif cost==4 then spawnScaleX=math.cos(spawn*math.pi) -- flip: mirrors through edge-on and back
    elseif cost==5 then spawnRot=spawn*math.pi*2 -- spin: unwinds a full rotation down to normal
    elseif cost==6 then spawnScaleX=math.cos(spawn*math.pi);spawnRot=spawn*math.pi*2 -- flip + spin
    end
  end
  -- Landing pop: brief scale-up when card arrives on field from hand
  local landPop=c.playLand or 0
  local landScale=1+landPop*0.25 -- up to 1.25x at peak
  love.graphics.push();local pivotX,pivotY=x+cardW/2,y+cardH/2;love.graphics.translate(pivotX,pivotY);love.graphics.rotate(spawnRot);love.graphics.scale(spawnScaleX*landScale,landScale);love.graphics.translate(-pivotX,-pivotY)
  love.graphics.setColor(0,0,0,.35);love.graphics.rectangle("fill",math.floor(x+5),math.floor(y+6),cardW,cardH,8,8)
  drawPaperCardSurface(x,y,cardW,cardH,c)
  drawFactionMedallion(x+12,y+12,8,c.group)
  drawCardIllustrationWindow(x+6,y+31,cardW-12,45,c)
  drawCardFrameDecor(x,y,cardW,cardH,c.rarity)
  cardText(c.name,x+22,y+6,cardW-27,"center",fonts.tiny)
  cardText(c.type.." · "..c.group,x+5,y+18,cardW-10,"center",fonts.tiny)
  local a,h,s=getCharacterStats(c,p);drawCardStat("⚔"..a,x+6,y+112,{.65,.16,.08});drawCardStat("♥"..h,x+35,y+112,{.12,.45,.18});drawCardStat("⚡"..s,x+65,y+112,{.55,.38,.05})
  local sk={} for _,v in ipairs(c.skills) do sk[#sk+1]=SKILL_ICON[v] or "•" end;cardText(table.concat(sk," "),x+4,y+82,cardW-8,"center",fonts.tiny)
  if #(c.equipped or {})>0 then cardText("●"..#c.equipped,x+5,y+92,cardW-10,"right",fonts.tiny) end
  if c.hasAttacked then love.graphics.setColor(0,0,0,.32);love.graphics.rectangle("fill",x,y,cardW,cardH,8,8) end
  -- Hit flash: red overlay that fades out after taking damage
  local flash=c.hitFlash or 0
  if flash>0 then love.graphics.setColor(1,.15,.1,flash*.55);love.graphics.rectangle("fill",x,y,cardW,cardH,8,8) end
  love.graphics.pop()
  return x,y
end
local function drawSingleCard(c,x,y,angle,hover,showRarity)
  showRarity=showRarity==true
  local sc=hover and 1.13 or 1; love.graphics.push();love.graphics.translate(x+cardW/2,y+cardH/2);love.graphics.rotate(angle or 0);love.graphics.scale(sc);love.graphics.translate(-cardW/2,-cardH/2)
  local shadowOffset=hover and 9 or 5
  local shadowAlpha=hover and .5 or .4
  local gc=groupColor(c);love.graphics.setColor(0,0,0,shadowAlpha);love.graphics.rectangle("fill",shadowOffset,shadowOffset+1,cardW,cardH,8,8)
  drawPaperCardSurface(0,0,cardW,cardH,c)
  drawFactionMedallion(12,12,8,c.group)
  drawCardIllustrationWindow(6,30,cardW-12,32,c)
  drawCardFrameDecor(0,0,cardW,cardH,c.rarity)
  cardText("◆"..c.manaCost,cardW-25,5,20,"right",fonts.tiny)
  cardText(c.name,22,5,cardW-49,"center",fonts.tiny)
  cardText(c.type.." · "..c.group,5,18,cardW-10,"center",fonts.tiny)
  local ss={} for _,s in ipairs(c.skills) do ss[#ss+1]=(SKILL_ICON[s] or "•")..s end;cardText(table.concat(ss," "),5,69,cardW-10,"center",fonts.tiny)
  if c.type=="Character" or c.type=="Equipment" then drawCardStat("⚔"..c.attack,6,111,{.65,.16,.08});drawCardStat("♥"..c.health,35,111,{.12,.45,.18});drawCardStat("⚡"..c.speed,65,111,{.55,.38,.05}) end
  if showRarity then cardText(c.rarity,cardW-48,cardH-17,42,"right",fonts.tiny,{.25,.18,.12}) end
  love.graphics.pop()
end
local function handPosition(i,n)
  local spacing=math.min(105,800/math.max(1,n));local x=VIRTUAL_WIDTH/2-(n-1)*spacing/2+(i-1)*spacing;local d=x-VIRTUAL_WIDTH/2;return x,785+math.abs(d)*.07,d*.0018 end
local function startDrawAnimation(p)
  if #p.deck==0 then checkDeckOutWinCondition(p); return end
  if DEBUG_UNDO_ENABLED then saveUndoSnapshot() end -- DEBUG UNDO (must run before the deck is mutated below)
  local c=table.remove(p.deck)
  local deckX,deckY=LAYOUT.bottom.deck.x+cardW/2,LAYOUT.bottom.deck.y+cardH/2
  local handIdx=#p.hand+1
  local handX,handY,_=handPosition(handIdx,handIdx)
  drawAnimation={active=true,card=c,progress=0,startX=deckX,startY=deckY,endX=handX+cardW/2,endY=handY+cardH/2}
end
local function updateDrawAnimation(p,dt)
  if not drawAnimation.active then return end
  drawAnimation.progress=drawAnimation.progress+dt*3
  if drawAnimation.progress>=1 then
    p.hand[#p.hand+1]=drawAnimation.card
    p.hasDrawn=true
    drawAnimation.active=false
    phaseIndex=2
    addParticle(drawAnimation.endX,drawAnimation.endY,{.5,1,.5},"DRAW!")
  end
end
local function drawActiveFannedHand(p)
  for i,c in ipairs(p.hand) do if i~=dragIndex then local x,y,a=handPosition(i,#p.hand);local hov=mouseX>=x and mouseX<=x+cardW and mouseY>=y-30 and mouseY<=y+cardH;drawSingleCard(c,x,y+(hov and -28 or 0),a,hov) end end
end
local function drawOpponentInvertedHand(p)
  local n=#p.hand;for i=1,n do local x=VIRTUAL_WIDTH/2-(n-1)*34/2+(i-1)*34;rect(x,18,cardW,cardH,{.11,.15,.24},7);roundedOutline(x,18,cardW,cardH,{.35,.45,.6},1) end
end
local function drawPlayerHealth(p,y)
  local bx,by,bw,bh=525,y,390,25 -- bar bounding box
  local ratio=math.max(0,math.min(1,p.displayHealth/p.maxHealth))
  local fillW=math.floor((bw-6)*ratio) -- inner fill width
  local col=ratio>.55 and {.2,.9,.35} or ratio>.25 and {1,.6,.12} or {1,.18,.16}
  -- Dark background container
  rect(bx,by,bw,bh,{.08,.09,.12},12)
  -- Fluid fill: draw multiple vertical slices with a sine-wave top edge
  local ix,iy,iw,ih=bx+3,by+3,fillW,bh-6 -- inner region
  if fillW>0 then
    for sx=0,iw-1 do
      -- Two overlapping sine waves for organic fluid motion
      local wave1=math.sin((sx*0.08)+time*3.2)*1.8
      local wave2=math.sin((sx*0.13)+time*2.5+1.7)*1.0
      local waveOffset=wave1+wave2
      local sliceH=math.max(1,ih-2+waveOffset)
      local sliceY=iy+(ih-sliceH)
      love.graphics.setColor(col[1],col[2],col[3],1)
      love.graphics.rectangle("fill",ix+sx,sliceY,1,sliceH)
    end
    -- Fluid specular highlight (top band, follows wave)
    for sx=0,iw-1 do
      local wave1=math.sin((sx*0.08)+time*3.2)*1.8
      local wave2=math.sin((sx*0.13)+time*2.5+1.7)*1.0
      local waveOffset=wave1+wave2
      local sliceH=math.max(1,ih-2+waveOffset)
      local sliceY=iy+(ih-sliceH)
      love.graphics.setColor(1,1,1,.18+math.sin((sx*0.05)+time*4)*.06)
      love.graphics.rectangle("fill",ix+sx,sliceY,1,math.min(4,sliceH))
    end
    -- Subtle darker bottom edge for depth
    love.graphics.setColor(0,0,0,.2)
    love.graphics.rectangle("fill",ix,iy+ih-2,iw,2,2,2)
    -- Moving bubble highlights inside the fluid
    for b=0,2 do
      local bubbleX=ix+((time*40+b*130)%(math.max(1,iw)))
      local bubbleY=iy+ih*0.4+math.sin(time*2.8+b*2)*3
      if bubbleX<ix+iw-4 then
        love.graphics.setColor(1,1,1,.22)
        love.graphics.circle("fill",bubbleX,bubbleY,2)
      end
    end
  end
  -- Crack overlay when health < 10
  if p.displayHealth<10 and p.displayHealth>0 then
    local crackAlpha=0.6+math.sin(time*6)*0.2 -- pulsing crack visibility
    local crackShake=math.sin(time*12)*0.5 -- subtle tremor
    love.graphics.setColor(0,0,0,crackAlpha)
    love.graphics.setLineWidth(2)
    -- Main diagonal crack from center-top
    local cx=bx+bw*0.5+crackShake
    local cy=by+2
    love.graphics.line(cx,cy, cx-8,cy+8, cx-5,cy+13, cx-12,cy+18, cx-9,cy+bh-3)
    -- Branch crack to the left
    love.graphics.line(cx-5,cy+13, cx-18,cy+16, cx-22,cy+20)
    -- Branch crack to the right
    love.graphics.line(cx-8,cy+8, cx+4,cy+14, cx+8,cy+19)
    -- Second major crack (right side)
    local cx2=bx+bw*0.7+crackShake*0.7
    love.graphics.line(cx2,cy+1, cx2+5,cy+7, cx2+2,cy+14, cx2+7,cy+bh-4)
    love.graphics.line(cx2+5,cy+7, cx2+14,cy+10, cx2+16,cy+15)
    -- Glow around cracks for dramatic effect
    love.graphics.setColor(1,.15,.1,crackAlpha*0.4)
    love.graphics.setLineWidth(4)
    love.graphics.line(cx,cy, cx-8,cy+8, cx-5,cy+13, cx-12,cy+18, cx-9,cy+bh-3)
    love.graphics.line(cx2,cy+1, cx2+5,cy+7, cx2+2,cy+14, cx2+7,cy+bh-4)
    love.graphics.setLineWidth(1)
    -- Tiny debris particles near cracks
    for d=0,3 do
      local dx=cx-10+math.sin(time*3.5+d*1.8)*12
      local dy=by+5+((time*20+d*7)%18)
      love.graphics.setColor(.3,.1,.05,crackAlpha*0.6)
      love.graphics.rectangle("fill",dx+crackShake,dy,2,2)
    end
  end
  -- Border frame
  roundedOutline(bx,by,bw,bh,{.72,.47,.18},2)
  -- Health text
  text(p.name.." ("..p.assignedGroup..")  "..math.ceil(p.displayHealth).." / "..p.maxHealth,bx,by+3,bw,"center",fonts.small)
end
local function drawIndividualField(p,side)
  local l=LAYOUT[side]
  for i,c in ipairs(p.battlefield.characters) do
    local x=l.chars.x+(i-1)*110;local y=l.chars.y
    if not c.playFlying then -- skip rendering while card is in fly animation
      drawFieldCard(c,p,x,y,side)
      local targetable=(equipTargetCard and side=="bottom") or (signalTargetCard and not (signalTargetCard.spell and hasSkill(c,"Cloak")))
      if targetable then drawHighlight(x,y,cardW,cardH,{.2,.8,1}) end
      if selectedAttacker and side=="bottom" and selectedAttacker.card==c then drawHighlight(x,y,cardW,cardH,{1,.8,.15}) end
    end
  end
  for i,c in ipairs(p.battlefield.areas) do drawSingleCard(c,l.areas.x+(i-1)*105,l.areas.y,0,false) end
  for i=1,5 do
    local ex=l.equip.x+(i-1)*105
    if not p.battlefield.equipments[i] then roundedOutline(ex,l.equip.y,cardW,cardH,{.58,.37,.15},1) end
  end
  for i,e in ipairs(p.battlefield.equipments) do
    drawSingleCard(e,l.equip.x+(i-1)*105,l.equip.y,0,false)
    if side=="bottom" then text("E"..(EQUIP_RARITY_COST[e.rarity] or 1),l.equip.x+(i-1)*105,l.equip.y+138,cardW,"center",fonts.tiny) end
  end
  if side=="bottom" then text("FIELD EQUIPMENT  •  click gear, then a character  •  E = rarity attach cost",l.equip.x,l.equip.y-20,520,"left",fonts.tiny) end
end

-- ============================================================================
-- PIXEL ART RENDERING SYSTEM
-- ============================================================================
local PIXEL_SCALE = 2 -- Scale factor for pixel art (2 = 2x pixel size)
local pixelCache = {} -- Cache for generated pixel patterns

-- Draw a scaled rectangle for pixel art rendering
local function drawPixelRect(x,y,w,h,col,pxScale)
  local scale=pxScale or PIXEL_SCALE
  love.graphics.setColor(col)
  love.graphics.rectangle("fill",x,y,w*scale,h*scale)
end

-- Generate a pixel pattern using a provided generator function
local function generatePixelPattern(width,height,generator)
  local pattern={}
  for py=1,height do
    pattern[py]={}
    for px=1,width do
      pattern[py][px]=generator(px,py)
    end
  end
  return pattern
end

local function drawPixelPattern(pattern,x,y,pxScale)
  local scale=pxScale or PIXEL_SCALE
  for py,row in ipairs(pattern) do
    for px,col in ipairs(row) do
      if col then
        love.graphics.setColor(col)
        love.graphics.rectangle("fill",x+(px-1)*scale,y+(py-1)*scale,scale,scale)
      end
    end
  end
end

-- Generate wood plank pattern with grain texture using sine waves
local function generateWoodPlankPattern(width,height)
  return generatePixelPattern(width,height,function(px,py)
    local grain=math.sin(px*.8+py*.5)*.08+math.sin(px*.2+py*.8)*.05 -- Wood grain variation
    local dark=math.sin(px*1.5+py*.3)*.06 -- Dark streaks
    local baseR=COLORS.tavernWood[1]+grain+dark
    local baseG=COLORS.tavernWood[2]+grain+dark
    local baseB=COLORS.tavernWood[3]+grain+dark
    return {math.max(0,math.min(1,baseR)),math.max(0,math.min(1,baseG)),math.max(0,math.min(1,baseB))}
  end)
end

local function generateBarrelPattern(width,height)
  return generatePixelPattern(width,height,function(px,py)
    local cx,cy=width/2,height/2
    local dist=math.sqrt((px-cx)^2+(py-cy)^2)
    local maxDist=math.min(cx,cy)*.95
    
    if dist>maxDist then return COLORS.tavernDark end
    
    local ringPos=(py/height)*3
    if ringPos>0.2 and ringPos<0.35 then return {.25,.12,.05} end
    if ringPos>0.6 and ringPos<0.75 then return {.25,.12,.05} end
    
    local shade=1-((dist/maxDist)*.3)
    local noise=math.sin(px*.6+py*.4)*.03
    local r=COLORS.tavernWood[1]*shade+noise
    local g=COLORS.tavernWood[2]*shade+noise
    local b=COLORS.tavernWood[3]*shade+noise
    return {math.max(0,math.min(1,r)),math.max(0,math.min(1,g)),math.max(0,math.min(1,b))}
  end)
end

local function generateParchmentPattern(width,height)
  return generatePixelPattern(width,height,function(px,py)
    local noise=math.sin(px*.25+py*.2)*.02+math.sin(px*.15+py*.35)*.015
    local age=math.random()*.01
    local r=COLORS.tavernParchment[1]-noise-age
    local g=COLORS.tavernParchment[2]-noise-age*.5
    local b=COLORS.tavernParchment[3]-noise-age
    return {math.max(.85,math.min(.95,r)),math.max(.80,math.min(.90,g)),math.max(.70,math.min(.80,b))}
  end)
end

local function generateGemPattern(width,height,gemColor)
  return generatePixelPattern(width,height,function(px,py)
    local cx,cy=width/2,height/2
    local dist=math.sqrt((px-cx)^2+(py-cy)^2)
    local maxDist=math.min(cx,cy)*.8
    
    if dist>maxDist then return nil end
    
    local facet=math.sin(px*.8)*math.sin(py*.8)*.1
    local shine=1-(dist/maxDist)*.4
    local r=gemColor[1]*shine+facet
    local g=gemColor[2]*shine+facet
    local b=gemColor[3]*shine+facet
    return {math.max(0,math.min(1,r)),math.max(0,math.min(1,g)),math.max(0,math.min(1,b))}
  end)
end

local function generateDrinkPattern(width,height,drinkColor)
  return generatePixelPattern(width,height,function(px,py)
    local cx=width/2
    if py<height*.2 then return {.4,.25,.1} end
    if py>height*.8 then return {.35,.2,.08} end
    if px<width*.2 or px>width*.8 then return {.4,.25,.1} end
    
    local bubble=math.sin(px*2+time)*math.sin(py*2+time)*.05
    local r=drinkColor[1]+bubble
    local g=drinkColor[2]+bubble
    local b=drinkColor[3]+bubble
    return {math.max(0,math.min(1,r)),math.max(0,math.min(1,g)),math.max(0,math.min(1,b))}
  end)
end

local function drawPixelTavernBackground()
  love.graphics.setColor(COLORS.tavernDark)
  love.graphics.rectangle("fill",0,0,VIRTUAL_WIDTH,VIRTUAL_HEIGHT)
  
  local plankHeight=VIRTUAL_HEIGHT/12
  for y=0,VIRTUAL_HEIGHT,plankHeight do
    local pattern=generateWoodPlankPattern(math.ceil(VIRTUAL_WIDTH/PIXEL_SCALE),math.ceil(plankHeight/PIXEL_SCALE))
    drawPixelPattern(pattern,0,y)
  end
  
  love.graphics.setColor(0,0,0,.15)
  for y=0,VIRTUAL_HEIGHT,plankHeight do
    love.graphics.rectangle("fill",0,y+plankHeight-4,VIRTUAL_WIDTH,4)
  end
end

local function drawPixelBarrel(x,y)
  local pattern=generateBarrelPattern(25,35)
  drawPixelPattern(pattern,x,y)
  love.graphics.setColor(0,0,0,.2)
  love.graphics.rectangle("fill",x+4,y+36,50,4)
end

local function drawPixelGem(x,y,color)
  local pattern=generateGemPattern(12,12,color)
  drawPixelPattern(pattern,x,y)
  love.graphics.setColor(color[1],color[2],color[3],.3)
  love.graphics.rectangle("fill",x-2,y-2,28,28)
end

local function drawPixelDrink(x,y,color)
  local pattern=generateDrinkPattern(16,20,color)
  drawPixelPattern(pattern,x,y)
  love.graphics.setColor(0,0,0,.2)
  love.graphics.rectangle("fill",x+2,y+22,36,4)
end

local function drawPixelParchmentPanel(x,y,w,h)
  love.graphics.setColor(0,0,0,.4)
  love.graphics.rectangle("fill",x+8,y+8,w,h)
  
  local pattern=generateParchmentPattern(math.ceil(w/PIXEL_SCALE),math.ceil(h/PIXEL_SCALE))
  drawPixelPattern(pattern,x,y)
  
  love.graphics.setColor({.3,.18,.08})
  love.graphics.setLineWidth(6)
  love.graphics.rectangle("line",x,y,w,h)
  
  love.graphics.setColor(1,1,1,.05)
  love.graphics.rectangle("line",x+3,y+3,w-6,h-6)
end

-- ============================================================================
-- STORM WEATHER SYSTEM
-- ============================================================================

-- Weather variants for the menu sky. Chosen randomly on launch; can also be
-- changed manually via the settings gear icon on the menu screen.
local WEATHER_TYPES = {"storm", "clear_night", "sunset", "snow"}
local WEATHER_LABELS = { storm = "Stormy Night", clear_night = "Clear Night", sunset = "Sunset", snow = "Snowfall" }
local weather = "storm"
local settingsOpen = false -- whether the menu settings panel is currently open
local almanacOpen = false -- whether the Almanac screen is showing
local almanacReturnState = "menu" -- state to return to when Almanac closes
local almanacScroll = 0 -- vertical scroll offset for the almanac
local almanacTab = "cards" -- current tab: "cards" or "skills"

-- Per-weather sky gradient bands (top to bottom) and theming colors
local WEATHER_THEME = {
  storm       = { bands = {{.06,.08,.13},{.10,.13,.20},{.15,.19,.28},{.20,.25,.35}}, mountainFar={.25,.42,.65}, mountainNear={.18,.32,.52}, ground={.20,.49,.28}, groundEdge={.28,.61,.33}, hasEyes=true },
  clear_night = { bands = {{.02,.03,.10},{.05,.07,.17},{.08,.11,.23},{.13,.17,.30}}, mountainFar={.14,.18,.30}, mountainNear={.09,.12,.22}, ground={.09,.20,.14}, groundEdge={.13,.27,.18}, hasEyes=true },
  sunset      = { bands = {{.16,.07,.16},{.42,.15,.20},{.68,.32,.22},{.92,.60,.30}}, mountainFar={.42,.28,.42}, mountainNear={.28,.16,.30}, ground={.30,.32,.16}, groundEdge={.40,.42,.20}, hasEyes=false },
  snow        = { bands = {{.30,.34,.42},{.45,.50,.58},{.62,.67,.74},{.80,.84,.90}}, mountainFar={.55,.60,.68},  mountainNear={.42,.47,.56}, ground={.78,.82,.87}, groundEdge={.90,.93,.97}, hasEyes=false }
}

-- Populate the particle arrays needed for a given weather type, but only if they
-- aren't already populated. Used both at startup (resetStorm) and whenever the
-- weather is switched manually via the menu settings panel -- without this,
-- picking a weather that was never the initial random choice would have no rain/
-- snow particles to draw at all (the arrays would still be empty).
local function ensureWeatherParticles(w)
  if w=="storm" and #storm.rain==0 then
    for i=1,105 do storm.rain[i]={x=math.random(0,610),y=math.random(-100,590),speed=280+math.random()*220,length=8+math.random()*12} end
  elseif w=="snow" and #storm.snow==0 then
    for i=1,90 do storm.snow[i]={x=math.random(0,1440),y=math.random(-100,590),speed=25+math.random()*35,drift=math.random()*30-15,size=2+math.random()*3,phase=math.random()*6.28} end
  elseif w=="clear_night" and #storm.stars==0 then
    for i=1,130 do storm.stars[i]={x=math.random(0,1440),y=math.random(0,480),size=1+math.random()*1.6,phase=math.random()*6.28,speed=1+math.random()*2} end
  end
end

-- Initialize storm/weather with a random weather type and its particles/timers
local function resetStorm()
  weather = WEATHER_TYPES[math.random(#WEATHER_TYPES)]
  storm={rain={},eyes={},lightning=nil,flash=0,nextLightning=.7,nextEyes=.4,reveal=nil,ridge=nil,snow={},stars={}}
  ensureWeatherParticles(weather)
end
-- Update weather animation: precipitation, lightning strikes, and glowing eyes
local function updateStorm(dt)
  if weather=="storm" then
    -- Update rain drops (falling down and moving left with wind)
    for _,drop in ipairs(storm.rain) do
      drop.x=drop.x-dt*55;drop.y=drop.y+drop.speed*dt
      if drop.y>590 then drop.y=math.random(-80,-10);drop.x=math.random(0,610) end
      if drop.x<-20 then drop.x=610 end
    end
    -- Update lightning flash effect
    storm.flash=math.max(0,storm.flash-dt*2.6)
    storm.nextLightning=storm.nextLightning-dt
    if storm.nextLightning<=0 then
      local x=math.random(80,560);local points={{x=x,y=0}}
      for i=1,7 do points[#points+1]={x=points[#points].x+math.random(-34,34),y=i*55+math.random(-12,12)} end
      storm.lightning={points=points,life=.18};storm.flash=.42;storm.nextLightning=2.4+math.random()*4.2
      if math.random()<.28 then storm.reveal={x=math.random(170,460),y=math.random(245,380),size=math.random(34,52),life=.16} end
      if math.random()<.18 then storm.ridge={x=math.random(105,500),life=.13} end
    end
    if storm.lightning then storm.lightning.life=storm.lightning.life-dt;if storm.lightning.life<=0 then storm.lightning=nil end end
    if storm.reveal then storm.reveal.life=storm.reveal.life-dt;if storm.reveal.life<=0 then storm.reveal=nil end end
    if storm.ridge then storm.ridge.life=storm.ridge.life-dt;if storm.ridge.life<=0 then storm.ridge=nil end end
  elseif weather=="snow" then
    -- Update falling snow (gentle drift instead of wind-driven rain)
    for _,flake in ipairs(storm.snow) do
      flake.y=flake.y+flake.speed*dt
      flake.x=flake.x+math.sin(time*.6+flake.phase)*flake.drift*dt
      if flake.y>590 then flake.y=math.random(-40,-5);flake.x=math.random(0,1440) end
      if flake.x<-10 then flake.x=1450 elseif flake.x>1450 then flake.x=-10 end
    end
  end
  -- Update glowing eyes (spooky background element, only in dark weather)
  if WEATHER_THEME[weather].hasEyes then
    storm.nextEyes=storm.nextEyes-dt
    if storm.nextEyes<=0 and #storm.eyes<3 then
      local x,y,valid
      for _=1,12 do
        x,y,valid=math.random(85,525),math.random(105,415),true
        for _,other in ipairs(storm.eyes) do
          if (x-other.x)^2+(y-other.y)^2<210^2 then valid=false;break end
        end
        if valid then break end
      end
      if valid then storm.eyes[#storm.eyes+1]={x=x,y=y,size=math.random(12,20),life=4.5+math.random()*3,phase=math.random()*6.28,blink=2.2+math.random()*2.4,blinkProgress=0,blinkState="waiting",driftX=(math.random()-.5)*5,driftY=(math.random()-.5)*3} end
      storm.nextEyes=1.4+math.random()*2.4
    end
    -- Update eye blinking animation
    for i=#storm.eyes,1,-1 do
      local eye=storm.eyes[i];eye.life=eye.life-dt
      if eye.blinkState=="waiting" then
        eye.blink=eye.blink-dt
        if eye.blink<=0 then eye.blinkState="closing" end
      elseif eye.blinkState=="closing" then
        eye.blinkProgress=math.min(1,eye.blinkProgress+dt*1.7)
        if eye.blinkProgress>=1 then eye.blinkState="opening" end
      else
        eye.blinkProgress=math.max(0,eye.blinkProgress-dt*1.7)
        if eye.blinkProgress<=0 then eye.blinkState="waiting";eye.blink=2.6+math.random()*3 end
      end
      if eye.life<=0 then table.remove(storm.eyes,i) end
    end
  end
end
-- ============================================================================
-- RENDERING FUNCTIONS
-- ============================================================================

-- Draw menu sky background for the current weather: gradient bands, clouds, and
-- weather-specific elements (rain+lightning / snowfall / stars+moon / sunset glow)
local function drawStormSky()
  local theme = WEATHER_THEME[weather]
  for i,color in ipairs(theme.bands) do love.graphics.setColor(color);love.graphics.rectangle("fill",0,(i-1)*150,VIRTUAL_WIDTH,150) end

  if weather=="clear_night" then
    -- Twinkling stars
    for _,star in ipairs(storm.stars) do
      local tw=.5+.5*math.sin(time*star.speed+star.phase)
      love.graphics.setColor(.85,.90,1,.4+.6*tw);love.graphics.circle("fill",star.x,star.y,star.size)
    end
    -- Moon with soft glow
    love.graphics.setColor(.9,.92,.85,.10);love.graphics.circle("fill",1180,120,70)
    love.graphics.setColor(.92,.94,.88);love.graphics.circle("fill",1180,120,42)
    love.graphics.setColor(.80,.82,.76);love.graphics.circle("fill",1165,105,7);love.graphics.circle("fill",1195,130,10);love.graphics.circle("fill",1170,140,5)
  elseif weather=="sunset" then
    -- Low sun near the horizon with a warm glow
    love.graphics.setColor(1,.75,.35,.18);love.graphics.circle("fill",720,470,140)
    love.graphics.setColor(1,.82,.42,.55);love.graphics.circle("fill",720,470,85)
    love.graphics.setColor(1,.92,.65);love.graphics.circle("fill",720,470,55)
  end

  -- Drifting cloud bands (shared across all weather, tinted per-theme)
  local cloudAlpha = weather=="sunset" and .35 or weather=="snow" and .55 or .72
  for i=1,7 do
    local drift=(time*(7+i*2))%220
    love.graphics.setColor(theme.mountainNear[1]*.4,theme.mountainNear[2]*.4,theme.mountainNear[3]*.4,cloudAlpha)
    love.graphics.rectangle("fill",-180+drift*i*0.1,(i%3)*72+28,650,54);love.graphics.rectangle("fill",220+drift*i*0.05,(i%4)*65+85,720,46)
  end

  if weather=="storm" then
    for _,drop in ipairs(storm.rain) do love.graphics.setColor(.52,.66,.80,.38);love.graphics.setLineWidth(2);love.graphics.line(drop.x,drop.y,drop.x-5,drop.y+drop.length) end
  elseif weather=="snow" then
    for _,flake in ipairs(storm.snow) do love.graphics.setColor(1,1,1,.75);love.graphics.circle("fill",flake.x,flake.y,flake.size) end
  end

  if theme.hasEyes then
    for _,eye in ipairs(storm.eyes) do
      local alpha=math.min(1,eye.life,.5)*(.78+.22*math.sin(time*3+eye.phase));local s=eye.size;local x=eye.x+math.sin(time*.35+eye.phase)*eye.driftX;local y=eye.y+math.cos(time*.28+eye.phase)*eye.driftY
      local open=math.max(.08,1-eye.blinkProgress*.92)
      love.graphics.setColor(.02,.10,.03,.52*alpha);love.graphics.rectangle("fill",x-s*1.75,y-s*open,s*1.45,s*1.2*open);love.graphics.rectangle("fill",x+s*.3,y-s*open,s*1.45,s*1.2*open)
      love.graphics.setColor(.10,.50,.10,.48*alpha);love.graphics.polygon("fill",x-s*1.55,y-s*.78*open,x-s*.45,y-s*.5*open,x-s*1.42,y-s*.02*open);love.graphics.polygon("fill",x+s*1.55,y-s*.78*open,x+s*.45,y-s*.5*open,x+s*1.42,y-s*.02*open)
      love.graphics.setColor(.60,1,.34,.98*alpha);love.graphics.polygon("fill",x-s*1.42,y-s*.72*open,x-s*.62,y-s*.44*open,x-s*1.34,y-s*.08*open);love.graphics.polygon("fill",x+s*1.42,y-s*.72*open,x+s*.62,y-s*.44*open,x+s*1.34,y-s*.08*open)
      love.graphics.setColor(.01,.05,.01,.98*alpha);love.graphics.rectangle("fill",x-s*1.04,y-s*.68*open,3,s*.62*open);love.graphics.rectangle("fill",x+s*1.01,y-s*.68*open,3,s*.62*open)
    end
  end
  if weather=="storm" and storm.reveal then
    local r=storm.reveal;local a=math.min(1,r.life*8);local s=r.size
    love.graphics.setColor(.03,.06,.05,.72*a);love.graphics.polygon("fill",r.x-s*2,r.y+s,r.x-s,r.y-s*1.3,r.x,r.y-s*1.8,r.x+s,r.y-s*1.3,r.x+s*2,r.y+s)
    love.graphics.setColor(.36,1,.18,.96*a);love.graphics.polygon("fill",r.x-s*1.65,r.y-s*.25,r.x-s*.5,r.y-s*.55,r.x-s*1.5,r.y+s*.22);love.graphics.polygon("fill",r.x+s*1.65,r.y-s*.25,r.x+s*.5,r.y-s*.55,r.x+s*1.5,r.y+s*.22)
    love.graphics.setColor(.01,.04,.01,.98*a);love.graphics.rectangle("fill",r.x-s*.94,r.y-s*.43,5,s*.54);love.graphics.rectangle("fill",r.x+s*.89,r.y-s*.43,5,s*.54)
  end
  if weather=="storm" and storm.lightning then
    love.graphics.setColor(.74,.86,1,math.min(1,storm.lightning.life*6));love.graphics.setLineWidth(5)
    for i=2,#storm.lightning.points do local a,b=storm.lightning.points[i-1],storm.lightning.points[i];love.graphics.line(a.x,a.y,b.x,b.y) end
  end
  if weather=="storm" and storm.flash>0 then love.graphics.setColor(.72,.82,1,storm.flash*.28);love.graphics.rectangle("fill",0,0,620,590) end
end

local function drawOutdoorMenu()
  local function menuText(s,x,y,w,align,font,color)
    love.graphics.setFont(font)
    love.graphics.setColor(color)
    love.graphics.printf(s,x,y,w,align)
  end
  drawStormSky()
  local theme = WEATHER_THEME[weather]

  love.graphics.setColor(theme.mountainFar);love.graphics.polygon("fill",0,570,150,400,300,570,470,350,640,570,810,360,980,570,1160,395,1440,565)
  love.graphics.setColor(theme.mountainNear);love.graphics.polygon("fill",0,600,230,465,430,600,650,430,860,600,1080,450,1280,600,1440,485,1440,650,0,650)
  if weather=="snow" then
    -- Snow caps on the distant mountain ridgeline
    love.graphics.setColor(1,1,1,.85)
    for _,peak in ipairs({{150,400},{470,350},{810,360},{1160,395}}) do love.graphics.polygon("fill",peak[1]-30,peak[2]+35,peak[1],peak[2],peak[1]+30,peak[2]+35) end
  end
  if weather=="storm" and storm.ridge then
    local r=storm.ridge;local a=math.min(1,r.life*9)
    love.graphics.setColor(.025,.035,.04,.86*a);love.graphics.polygon("fill",r.x-58,465,r.x-34,380,r.x-8,425,r.x+8,350,r.x+33,425,r.x+60,465)
    love.graphics.setColor(.75,.82,.94,.7*a);love.graphics.rectangle("fill",r.x-7,409,14,7)
  end
  -- Far castle, centered on the horizon.
  love.graphics.setColor(.40,.46,.58);love.graphics.rectangle("fill",305,315,170,245);love.graphics.rectangle("fill",270,365,62,195);love.graphics.rectangle("fill",448,365,62,195)
  love.graphics.setColor(.22,.28,.42);love.graphics.polygon("fill",260,365,301,300,342,365);love.graphics.polygon("fill",438,365,479,300,520,365);love.graphics.polygon("fill",335,315,390,245,445,315)
  local castleWindowGlow = (weather=="clear_night" or weather=="storm") and 1 or .4
  love.graphics.setColor(.64*castleWindowGlow+.2,.76*castleWindowGlow+.1,.91*castleWindowGlow+.05);for _,window in ipairs({{290,405},{360,365},{405,365},{465,405},{360,440},{405,440}}) do love.graphics.rectangle("fill",window[1],window[2],14,28) end
  love.graphics.setColor(.17,.27,.42);love.graphics.rectangle("fill",372,505,36,55)

  love.graphics.setColor(theme.ground);love.graphics.rectangle("fill",0,590,VIRTUAL_WIDTH,410);love.graphics.setColor(theme.groundEdge);love.graphics.rectangle("fill",0,590,VIRTUAL_WIDTH,22)
  love.graphics.setColor(.69,.54,.34);love.graphics.polygon("fill",385,1000,650,1000,585,590,530,590);love.graphics.setColor(.55,.40,.24);love.graphics.polygon("fill",440,1000,560,1000,555,590,535,590)
  if weather=="storm" then
    for i,puddle in ipairs({{170,895,86},{500,845,112},{365,940,70}}) do
      local ripple=(math.sin(time*3+i)*.5+.5)*8;love.graphics.setColor(.23,.34,.43,.48);love.graphics.ellipse("fill",puddle[1],puddle[2],puddle[3],18)
      love.graphics.setColor(.62,.75,.90,.18);love.graphics.ellipse("line",puddle[1]+puddle[3]/2-ripple,puddle[2]+4,ripple*2,5)
      if storm.flash>.05 then love.graphics.setColor(.82,.90,1,.26);love.graphics.rectangle("fill",puddle[1]+10,puddle[2]+6,puddle[3]-20,3) end
    end
  elseif weather=="snow" then
    -- Small snow drifts instead of puddles
    for _,drift in ipairs({{170,895,86},{500,845,112},{365,940,70}}) do
      love.graphics.setColor(1,1,1,.9);love.graphics.ellipse("fill",drift[1],drift[2],drift[3]*.5,10)
    end
  end
  if weather=="storm" or weather=="snow" then
    for i=1,4 do
      local fogX=((time*18+i*210)%860)-180;love.graphics.setColor(.66,.75,.78,.07);love.graphics.rectangle("fill",fogX,520+i*18,360,28)
    end
  end

  -- Small foreground tavern, positioned in the lower-left third.
  love.graphics.setColor(.22,.12,.06);love.graphics.rectangle("fill",385,555,38,120)
  for i=1,5 do
    local smokeX=397+math.sin(time*.7+i)*18+i*6;local smokeY=540-i*28-(time*16%28);love.graphics.setColor(.50,.56,.60,.12);love.graphics.rectangle("fill",smokeX,smokeY,28+i*5,18+i*3)
  end
  love.graphics.setColor(.16,.09,.05);love.graphics.rectangle("fill",80,655,400,220);love.graphics.setColor(.49,.27,.12);love.graphics.rectangle("fill",95,665,370,205)
  if weather=="snow" then love.graphics.setColor(1,1,1,.85);love.graphics.polygon("fill",55,665,275,510,500,665,470,665,275,545,80,665) end
  love.graphics.setColor(.71,.40,.16);love.graphics.polygon("fill",55,665,275,510,500,665);love.graphics.setColor(.28,.12,.06);love.graphics.polygon("fill",65,655,275,500,490,655)
  love.graphics.setColor(.36,.18,.08);love.graphics.rectangle("fill",255,740,70,130);local windowGlow=.66+.28*math.sin(time*7)+.08*math.sin(time*19)
  love.graphics.setColor(.96,.72,.20,windowGlow);love.graphics.rectangle("fill",130,720,75,48);love.graphics.rectangle("fill",350,720,75,48)
  love.graphics.setColor(.97,.87,.49,.45*windowGlow);love.graphics.rectangle("fill",138,728,59,32);love.graphics.rectangle("fill",358,728,59,32)
  love.graphics.setColor(.13,.07,.04);love.graphics.rectangle("fill",85,675,390,12);love.graphics.rectangle("fill",215,665,12,205);love.graphics.rectangle("fill",335,665,12,205)
  local signSway=math.sin(time*1.4)*4
  love.graphics.setColor(.18,.09,.04);love.graphics.setLineWidth(3);love.graphics.line(275,590,275+signSway,610)
  love.graphics.setColor(.95,.77,.28);love.graphics.rectangle("fill",175+signSway,610,200,42);menuText("THE TAVERN",175+signSway,621,200,"center",fonts.small,{.29,.12,.05})

  -- A 720px-wide board with a 100px right margin creates a balanced frame.
  local panelX,panelY,panelW,panelH=620,100,720,790
  love.graphics.setColor(0,0,0,.28);love.graphics.rectangle("fill",panelX+10,panelY+12,panelW,panelH)
  love.graphics.setColor(.16,.10,.07);love.graphics.rectangle("fill",panelX,panelY,panelW,panelH)
  love.graphics.setColor(.91,.82,.61);love.graphics.rectangle("fill",panelX+10,panelY+10,panelW-20,panelH-20)
  love.graphics.setColor(.66,.43,.19);love.graphics.setLineWidth(6);love.graphics.rectangle("line",panelX+10,panelY+10,panelW-20,panelH-20)
  menuText("THE TAVERN",panelX+40,155,panelW-80,"center",fonts.big,{.27,.13,.06});menuText("CARD BATTLE",panelX+40,197,panelW-80,"center",fonts.big,{.58,.24,.12})
  love.graphics.setColor(.70,.47,.17);love.graphics.rectangle("fill",panelX+190,244,340,4);menuText("Choose your deck",panelX+40,270,panelW-80,"center",fonts.small,{.34,.20,.10})

  local deckPositions={{700,335},{1010,335},{700,470},{1010,470}}
  for i,deckId in ipairs(DECK_ORDER) do
    local definition=DECK_DEFINITIONS[deckId];local x,y=deckPositions[i][1],deckPositions[i][2];local faction=definition.faction;local selected=selectedDeck==deckId;local hovered=mouseX>=x and mouseX<=x+250 and mouseY>=y and mouseY<=y+105
    love.graphics.setColor(selected and {.83,.58,.14} or {.42,.25,.12});love.graphics.rectangle("fill",x,y,250,105)
    love.graphics.setColor(selected and {.98,.84,.34} or {.70,.49,.24});love.graphics.setLineWidth(selected and 5 or 3);love.graphics.rectangle("line",x,y,250,105)
    love.graphics.setColor(COLORS[faction]);love.graphics.rectangle("fill",x+15,y+15,72,72);love.graphics.setColor(1,1,1,.23);love.graphics.rectangle("fill",x+22,y+22,22,22)
    menuText(definition.name,x+102,y+39,130,"center",fonts.small,{.96,.90,.72})
    if selected then
      if faction=="Simple" then
        local cx,cy=x+167,y+52
        for i=1,3 do
          local radius=18+i*10;local phase=time*2.5+i*1.8
          love.graphics.setColor(.20,.70,1,.38+.15*math.sin(phase));love.graphics.setLineWidth(2)
          love.graphics.arc("line","open",cx,cy,radius,phase,phase+2.35)
          love.graphics.setColor(.70,.94,1,.75);love.graphics.rectangle("fill",cx+math.cos(phase+2.35)*radius-2,cy+math.sin(phase+2.35)*radius-2,4,4)
        end
      else
        local particleColor=faction=="Monkey" and {1,.78,.20} or faction=="Zombie" and {.43,1,.42} or {1,.34,.20}
        for i=1,7 do
          local px=x+98+((i*31+math.sin(time*2+i)*15)%130);local py=y+18+((i*17+time*18)%65)
          love.graphics.setColor(particleColor[1],particleColor[2],particleColor[3],.35+.25*math.sin(time*4+i))
          if faction=="Monkey" then love.graphics.rectangle("fill",px,py,5,5) elseif faction=="Fighter" then love.graphics.rectangle("fill",px,py,3,7) else love.graphics.rectangle("fill",px,py,4,4) end
        end
      end
      love.graphics.setColor(.92,.20,.16);love.graphics.rectangle("fill",x+219,y+12,19,19)
    elseif hovered then love.graphics.setColor(1,1,1,.10);love.graphics.rectangle("fill",x,y,250,105) end
  end
  local selectedDefinition=DECK_DEFINITIONS[selectedDeck]
  menuText("Selected deck: "..(selectedDefinition and selectedDefinition.name or selectedDeck),panelX+40,605,panelW-80,"center",fonts.small,{.34,.20,.10})
  local startX,startY,startW,startH=760,660,440,90;local startHovered=mouseX>=startX and mouseX<=startX+startW and mouseY>=startY and mouseY<=startY+startH
  love.graphics.setColor(startHovered and {.76,.25,.13} or {.57,.18,.10});love.graphics.rectangle("fill",startX,startY,startW,startH);love.graphics.setColor(.98,.75,.25);love.graphics.setLineWidth(5);love.graphics.rectangle("line",startX,startY,startW,startH)
  menuText(DATA.text("button_start_game","START GAME"),startX,startY+29,startW,"center",fonts.big,{.99,.93,.75})
  -- Almanac button (below START GAME)
  local almX,almY,almW,almH=860,770,240,50;local almHovered=mouseX>=almX and mouseX<=almX+almW and mouseY>=almY and mouseY<=almY+almH
  love.graphics.setColor(almHovered and {.18,.35,.55} or {.12,.22,.38});love.graphics.rectangle("fill",almX,almY,almW,almH,6,6)
  love.graphics.setColor(.6,.75,.95);love.graphics.setLineWidth(3);love.graphics.rectangle("line",almX,almY,almW,almH,6,6)
  menuText(DATA.text("button_almanac","ALMANAC"),almX,almY+14,almW,"center",fonts.small,{.9,.92,1})

  -- Settings gear icon (bottom-right corner) and the background/weather panel it opens
  local gx,gy,gr=VIRTUAL_WIDTH-55,VIRTUAL_HEIGHT-55,26
  local gearHovered=(mouseX-gx)^2+(mouseY-gy)^2<=(gr+6)^2
  love.graphics.setColor(0,0,0,.35);love.graphics.circle("fill",gx+3,gy+4,gr+8)
  love.graphics.setColor(gearHovered and {.98,.80,.32} or {.72,.55,.30});love.graphics.circle("fill",gx,gy,gr+8)
  local gearCol=gearHovered and {.35,.20,.08} or {.22,.13,.06}
  for i=0,7 do
    local a=i*(math.pi/4)
    love.graphics.push();love.graphics.translate(gx+math.cos(a)*gr*1.05,gy+math.sin(a)*gr*1.05);love.graphics.rotate(a)
    love.graphics.setColor(gearCol);love.graphics.rectangle("fill",-gr*.22,-gr*.32,gr*.44,gr*.64)
    love.graphics.pop()
  end
  love.graphics.setColor(gearCol);love.graphics.circle("fill",gx,gy,gr*.78)
  love.graphics.setColor(.94,.86,.62);love.graphics.circle("fill",gx,gy,gr*.42)
  love.graphics.setColor(gearCol);love.graphics.circle("fill",gx,gy,gr*.2)

  if settingsOpen then
    local panelW,panelH=300,240
    local px,py=VIRTUAL_WIDTH-panelW-20,VIRTUAL_HEIGHT-panelH-95
    love.graphics.setColor(0,0,0,.35);love.graphics.rectangle("fill",px+6,py+8,panelW,panelH,10,10)
    love.graphics.setColor(.16,.10,.07);love.graphics.rectangle("fill",px,py,panelW,panelH,10,10)
    love.graphics.setColor(.66,.43,.19);love.graphics.setLineWidth(4);love.graphics.rectangle("line",px,py,panelW,panelH,10,10)
    menuText("Menu Background",px+15,py+16,panelW-30,"center",fonts.small,{.94,.86,.62})
    for i,w in ipairs(WEATHER_TYPES) do
      local oy=py+52+(i-1)*44
      local isActive=(weather==w)
      local rowHov=mouseX>=px+14 and mouseX<=px+panelW-14 and mouseY>=oy and mouseY<=oy+36
      love.graphics.setColor(isActive and {.83,.58,.14} or (rowHov and {.36,.22,.13} or {.24,.15,.09}))
      love.graphics.rectangle("fill",px+14,oy,panelW-28,36,6,6)
      love.graphics.setColor(isActive and {.98,.84,.34} or {.55,.40,.24});love.graphics.setLineWidth(2);love.graphics.rectangle("line",px+14,oy,panelW-28,36,6,6)
      menuText((isActive and "● " or "").. (WEATHER_LABELS[w] or w),px+14,oy+9,panelW-28,"center",fonts.small,{.96,.90,.72})
    end
  end
end

local function drawMenu()
  drawOutdoorMenu()
  if false then
  -- Initialize menu particles on first frame
  if #menuParticles==0 then
    for i=1,30 do
      menuParticles[i]={
        x=math.random(VIRTUAL_WIDTH),
        y=math.random(VIRTUAL_HEIGHT),
        vx=(math.random()-.5)*15,
        vy=(math.random()-.5)*15,
        size=math.random(1,3),
        alpha=math.random(.05,.2)
      }
    end
  end

  for i,p in ipairs(menuParticles) do
    p.x=p.x+p.vx*.01;p.y=p.y+p.vy*.01
    if p.x<0 then p.x=VIRTUAL_WIDTH elseif p.x>VIRTUAL_WIDTH then p.x=0 end
    if p.y<0 then p.y=VIRTUAL_HEIGHT elseif p.y>VIRTUAL_HEIGHT then p.y=0 end
    love.graphics.setColor(1,.95,.8,p.alpha*.5*math.sin(time*2+i*.2))
    love.graphics.rectangle("fill",p.x,p.y,p.size*2,p.size*2)
  end

  -- Pixel art tavern background
  drawPixelTavernBackground()

  -- Pixel art barrels (left side)
  local barrelPositions = {{x=80,y=300},{x=60,y=450},{x=100,y=600}}
  for _,pos in ipairs(barrelPositions) do
    drawPixelBarrel(pos.x,pos.y)
  end

  -- Pixel art barrels (right side)
  local barrelPositions2 = {{x=1290,y=300},{x=1310,y=450},{x=1270,y=600}}
  for _,pos in ipairs(barrelPositions2) do
    drawPixelBarrel(pos.x,pos.y)
  end

  -- Decorative gems (red, blue, green)
  local gemPositions = {{x=120,y=180,col={.9,.2,.3}},{x=1320,y=180,col={.2,.5,.9}},{x=120,y=820,col={.3,.8,.4}},{x=1320,y=820,col={.9,.2,.3}}}
  for _,gem in ipairs(gemPositions) do
    drawPixelGem(gem.x,gem.y,gem.col)
  end

  -- Decorative drinks
  local drinkPositions = {{x=200,y=250,col={.6,.2,.8}},{x=1240,y=250,col={.8,.6,.2}},{x=200,y=750,col={.2,.7,.8}},{x=1240,y=750,col={.7,.3,.5}}}
  for _,drink in ipairs(drinkPositions) do
    drawPixelDrink(drink.x,drink.y,drink.col)
  end

  -- Pixel art candles on walls
  local candles = {{x=150,y=150},{x=1290,y=150},{x=150,y=850},{x=1290,y=850}}
  for i,candle in ipairs(candles) do
    local flicker=.7+.3*math.sin(time*5+i)
    drawPixelRect(candle.x-12,candle.y,24,60,{.3,.15,.05})
    drawPixelRect(candle.x-16,candle.y+40,32,16,{.3,.15,.05})
    love.graphics.setColor(COLORS.tavernCandle[1],COLORS.tavernCandle[2],COLORS.tavernCandle[3],.2*flicker)
    love.graphics.rectangle("fill",candle.x-20,candle.y-20,40,40)
    love.graphics.setColor(COLORS.tavernCandle[1],COLORS.tavernCandle[2],COLORS.tavernCandle[3],.4*flicker)
    love.graphics.rectangle("fill",candle.x-12,candle.y-12,24,24)
    love.graphics.setColor(1,.95,.7,.8*flicker)
    love.graphics.rectangle("fill",candle.x-8,candle.y-8,8,8)
  end

  -- Pixel art torches
  local torches = {{x=300,y=100},{x=1140,y=100},{x=300,y=900},{x=1140,y=900}}
  for _,torch in ipairs(torches) do
    local flicker=.6+.4*math.sin(time*6)
    drawPixelRect(torch.x-6,torch.y,12,40,{.3,.15,.05})
    love.graphics.setColor(COLORS.tavernCandle[1],COLORS.tavernCandle[2],COLORS.tavernCandle[3],.15*flicker)
    love.graphics.rectangle("fill",torch.x-10,torch.y-10,20,20)
    love.graphics.setColor(1,.9,.6,.7*flicker)
    love.graphics.rectangle("fill",torch.x-4,torch.y-4,8,8)
  end

  love.graphics.setColor(0,0,0,.3)
  love.graphics.rectangle("fill",0,0,VIRTUAL_WIDTH,VIRTUAL_HEIGHT)

  love.graphics.setColor(COLORS.tavernDark)
  love.graphics.rectangle("fill",0,250,VIRTUAL_WIDTH,15)
  love.graphics.rectangle("fill",0,500,VIRTUAL_WIDTH,15)
  love.graphics.rectangle("fill",0,750,VIRTUAL_WIDTH,15)
  love.graphics.setColor(COLORS.tavernLight)
  love.graphics.rectangle("fill",0,253,VIRTUAL_WIDTH,9)
  love.graphics.rectangle("fill",0,503,VIRTUAL_WIDTH,9)
  love.graphics.rectangle("fill",0,753,VIRTUAL_WIDTH,9)

  -- Pixel art parchment panel
  drawPixelParchmentPanel(200,200,1040,600)

  -- Pixel art corner accents
  love.graphics.setColor(COLORS.tavernGold)
  love.graphics.rectangle("fill",220,220,30,30)
  love.graphics.rectangle("fill",1190,220,30,30)
  love.graphics.rectangle("fill",220,750,30,30)
  love.graphics.rectangle("fill",1190,750,30,30)

  -- Title with pixel font
  love.graphics.setFont(fonts.pixel)
  love.graphics.setColor(COLORS.tavernDark)
  love.graphics.print("THE TAVERN",VIRTUAL_WIDTH/2-120,230)
  love.graphics.print("CARD BATTLE",VIRTUAL_WIDTH/2-120,265)

  love.graphics.setColor(COLORS.tavernGold[1],COLORS.tavernGold[2],COLORS.tavernGold[3],.6)
  love.graphics.rectangle("fill",VIRTUAL_WIDTH/2-100,295,200,3)

  love.graphics.setFont(fonts.small)
  love.graphics.setColor(COLORS.tavernWood)
  love.graphics.print("Choose your deck to begin",VIRTUAL_WIDTH/2-100,315)

  -- Pixel art deck selection buttons
  local decks = {"Simple", "Monkey", "Zombie", "Fighter"}
  local deckX = 270
  for i,deck in ipairs(decks) do
    local isSelected = selectedDeck == deck
    local deckHov = mouseX>=deckX and mouseX<=deckX+180 and mouseY>=380 and mouseY<=460
    local deckCol = isSelected and COLORS.tavernGold or (deckHov and COLORS.tavernLight or COLORS.tavernWood)
    
    if isSelected then
      local glowPulse=.7+.3*math.sin(time*3)
      love.graphics.setColor(COLORS.tavernGold[1],COLORS.tavernGold[2],COLORS.tavernGold[3],.35*glowPulse)
      love.graphics.rectangle("fill",deckX-6,375,192,92)
    end
    
    drawPixelRect(deckX,380,180,80,deckCol)
    love.graphics.setColor(COLORS[deck] or {.3,.35,.45})
    drawPixelRect(deckX+15,395,50,50,COLORS[deck] or {.3,.35,.45})
    love.graphics.setColor(COLORS.tavernParchment)
    love.graphics.setFont(fonts.small)
    love.graphics.print(deck,deckX+75,405)
    
    if isSelected then
      love.graphics.setColor(COLORS.tavernGold)
      love.graphics.rectangle("fill",deckX+10,465,10,10)
      love.graphics.rectangle("fill",deckX+25,485,10,10)
      love.graphics.rectangle("fill",deckX+40,485,10,10)
    end
    
    deckX = deckX + 220
  end

  love.graphics.setFont(fonts.small)
  love.graphics.setColor(COLORS.tavernWood)
  love.graphics.print("Selected: "..selectedDeck,VIRTUAL_WIDTH/2-70,490)

  love.graphics.setFont(fonts.big)
  local startHov=mouseX>=520 and mouseX<=920 and mouseY>=530 and mouseY<=630
  local startPulse=.7+.3*math.sin(time*4)
  local startCol=startHov and COLORS.tavernGold or COLORS.tavernWood
  
  love.graphics.setColor(COLORS.tavernGold[1],COLORS.tavernGold[2],COLORS.tavernGold[3],.25*startPulse)
  love.graphics.rectangle("fill",513,523,414,94)
  
  drawPixelRect(520,530,400,80,startCol)
  love.graphics.setColor(COLORS.tavernParchment)
  love.graphics.print("START GAME",VIRTUAL_WIDTH/2-110,555)

  local arrowPulse=.5+.5*math.sin(time*5)
  love.graphics.setColor(COLORS.tavernGold[1],COLORS.tavernGold[2],COLORS.tavernGold[3],arrowPulse)
  love.graphics.polygon("fill",VIRTUAL_WIDTH/2,620,VIRTUAL_WIDTH/2-18,640,VIRTUAL_WIDTH/2+18,640)

  love.graphics.setFont(fonts.small)
  love.graphics.setColor(COLORS.tavernWood)
  love.graphics.print("Click to begin",VIRTUAL_WIDTH/2-70,650)
  end
end
local function drawBattlefieldGrid()
  love.graphics.setColor(.18,.09,.04,.38);for x=250,1190,110 do love.graphics.line(x,155,x,745) end;for y=155,745,145 do love.graphics.line(250,y,1190,y) end
  drawIndividualField(opponentPlayer(),"top");drawIndividualField(activePlayer(),"bottom")
end
local function button(label,x,y,w,h,enabled)
  local hov=mouseX>=x and mouseX<=x+w and mouseY>=y and mouseY<=y+h;local c=enabled and (hov and {.69,.30,.12} or {.42,.20,.08}) or {.18,.12,.08}
  rect(x,y,w,h,c,5)
  -- Bevel highlight/shadow strips for a less flat, embossed look
  love.graphics.setColor(1,1,1,.10);love.graphics.rectangle("fill",x+3,y+2,w-6,3)
  love.graphics.setColor(0,0,0,.22);love.graphics.rectangle("fill",x+3,y+h-5,w-6,3)
  roundedOutline(x,y,w,h,hov and {.98,.76,.28} or {.72,.47,.18},2)
  if enabled then
    love.graphics.setColor(.98,.76,.28,hov and .9 or .5)
    for _,corner in ipairs({{x+7,y+7},{x+w-7,y+7},{x+7,y+h-7},{x+w-7,y+h-7}}) do love.graphics.circle("fill",corner[1],corner[2],2.5) end
  end
  text(label,x,y+h/2-8,w,"center",fonts.small)
  return hov
end
local function drawActiveDeckAndMana()
  drawDeckStack(activePlayer(),LAYOUT.bottom.deck.x,LAYOUT.bottom.deck.y);drawDiscardPile(activePlayer(),LAYOUT.bottom.grave.x,LAYOUT.bottom.grave.y);drawManaCrystal(275,810,activePlayer())
end
local function drawOpponentDeckAndMana()
  drawDeckStack(opponentPlayer(),LAYOUT.top.deck.x,LAYOUT.top.deck.y);drawDiscardPile(opponentPlayer(),LAYOUT.top.grave.x,LAYOUT.top.grave.y);drawManaCrystal(1165,120,opponentPlayer())
end
local function drawUIHeader()
  rect(0,0,VIRTUAL_WIDTH,78,{.16,.08,.03},0);rect(0,922,VIRTUAL_WIDTH,78,{.16,.08,.03},0)
  -- Subtle wood-plank seams so the header/footer bars match the playmat's grain
  love.graphics.setColor(0,0,0,.18);love.graphics.rectangle("fill",0,26,VIRTUAL_WIDTH,2);love.graphics.rectangle("fill",0,948,VIRTUAL_WIDTH,2)
  love.graphics.setColor(1,1,1,.05);love.graphics.rectangle("fill",0,2,VIRTUAL_WIDTH,2);love.graphics.rectangle("fill",0,924,VIRTUAL_WIDTH,2)
  love.graphics.setColor(.63,.38,.15);love.graphics.rectangle("fill",0,73,VIRTUAL_WIDTH,5);love.graphics.rectangle("fill",0,922,VIRTUAL_WIDTH,5)
  drawPlayerHealth(opponentPlayer(),45)
  text("ROUND "..round.."  •  "..TURN_PHASES[phaseIndex],20,460,220,"left",fonts.small)
  text(activePlayer().name.."'S TURN",20,480,220,"left",fonts.small)
  local canDraw=phaseIndex==1 and #activePlayer().deck>0 and not drawAnimation.active
  local phaseLabel=phaseIndex==1 and "DRAW CARD" or phaseIndex==2 and "TO BATTLE →" or phaseIndex==3 and "TO END →" or "PASS TURN →"
  local phaseEnabled=not gameOver and not drawAnimation.active and (phaseIndex~=1 or canDraw)
  button(phaseLabel,1210,460,185,55,phaseEnabled)
  button("PASS TURN",1210,850,185,55,not gameOver and not drawAnimation.active)
  drawActiveDeckAndMana();drawOpponentDeckAndMana()
  -- DEBUG UNDO: temporary QA button, remove this block for the final build
  if DEBUG_UNDO_ENABLED then button("UNDO ("..#undoStack..")",18,16,150,42,#undoStack>0) end
  -- DEBUG QA: gear button + mana/draw panel, remove this block for the final build
  if DEBUG_QA_ENABLED then
    button("⚙ QA",178,16,60,42,true)
    if qaPanelOpen then
      rect(QA_PANEL.x,QA_PANEL.y,QA_PANEL.w,QA_PANEL.h,{.12,.06,.16,.95},8)
      roundedOutline(QA_PANEL.x,QA_PANEL.y,QA_PANEL.w,QA_PANEL.h,{.75,.35,.9},2)
      text("Set Mana (current: "..activePlayer().mana..")",QA_PANEL.x+10,QA_PANEL.y+8,QA_PANEL.w-20,"left",fonts.small)
      button("-10",QA_PANEL.x+QA_OFFSETS.minus10,QA_ROW_MANA_Y,36,QA_BTN_H,true)
      button("-1",QA_PANEL.x+QA_OFFSETS.minus1,QA_ROW_MANA_Y,36,QA_BTN_H,true)
      text("Pending: "..qaManaValue,QA_PANEL.x+92,QA_ROW_MANA_Y+8,110,"center",fonts.small)
      button("+1",QA_PANEL.x+QA_OFFSETS.plus1,QA_ROW_MANA_Y,36,QA_BTN_H,true)
      button("+10",QA_PANEL.x+QA_OFFSETS.plus10,QA_ROW_MANA_Y,36,QA_BTN_H,true)
      button("Apply",QA_PANEL.x+QA_OFFSETS.apply,QA_ROW_MANA_Y,78,QA_BTN_H,true)

      text("Draw Cards",QA_PANEL.x+10,QA_PANEL.y+76,QA_PANEL.w-20,"left",fonts.small)
      button("-10",QA_PANEL.x+QA_OFFSETS.minus10,QA_ROW_DRAW_Y,36,QA_BTN_H,true)
      button("-1",QA_PANEL.x+QA_OFFSETS.minus1,QA_ROW_DRAW_Y,36,QA_BTN_H,true)
      text("Pending: "..qaDrawValue,QA_PANEL.x+92,QA_ROW_DRAW_Y+8,110,"center",fonts.small)
      button("+1",QA_PANEL.x+QA_OFFSETS.plus1,QA_ROW_DRAW_Y,36,QA_BTN_H,true)
      button("+10",QA_PANEL.x+QA_OFFSETS.plus10,QA_ROW_DRAW_Y,36,QA_BTN_H,true)
      button("Apply",QA_PANEL.x+QA_OFFSETS.apply,QA_ROW_DRAW_Y,78,QA_BTN_H,true)
    end
  end
  -- In-game gear menu: navigation and session actions stay separate from QA.
  button("⚙",248,16,42,42,true)
  if gameMenuOpen then
    rect(GAME_MENU_PANEL.x,GAME_MENU_PANEL.y,GAME_MENU_PANEL.w,GAME_MENU_PANEL.h,{.10,.07,.05,.97},8)
    roundedOutline(GAME_MENU_PANEL.x,GAME_MENU_PANEL.y,GAME_MENU_PANEL.w,GAME_MENU_PANEL.h,{.72,.55,.28},2)
    text("GAME MENU",GAME_MENU_PANEL.x+10,GAME_MENU_PANEL.y+10,GAME_MENU_PANEL.w-20,"center",fonts.small)
    button(DATA.text("button_restart","RESTART"),GAME_MENU_PANEL.x+12,GAME_MENU_PANEL.y+42,GAME_MENU_PANEL.w-24,32,true)
    button(DATA.text("button_almanac","ALMANAC"),GAME_MENU_PANEL.x+12,GAME_MENU_PANEL.y+80,GAME_MENU_PANEL.w-24,32,true)
    button(DATA.text("button_main_menu","MAIN MENU"),GAME_MENU_PANEL.x+12,GAME_MENU_PANEL.y+118,GAME_MENU_PANEL.w-24,32,true)
  end
end
local function drawEquipmentDetailOverlay(c)
  drawThemedPanel(410,250,620,420,{.3,.8,1})
  text(c.name.."'s Equipment",430,280,580,"center",fonts.big)
  local a,h,s=getEquipmentBonuses(c);text("Total bonus: ⚔"..a.."  ♥"..h.."  ⚡"..s,430,325,580,"center",fonts.small)
  for i,e in ipairs(c.equipped or {}) do drawSingleCard(e,450+(i-1)*105,380,0,false) end
end
local function drawCardDetailOverlay(c)
  drawThemedPanel(370,190,700,600,COLORS[c.rarity] or COLORS.Basic);drawSingleCard(c,430,310,0,false,true);text(c.name,555,250,430,"center",fonts.big);text(c.type.." • "..c.rarity.." • "..c.group,555,295,430,"center",fonts.small);text("Skills: "..table.concat(c.skills,", "),555,355,430,"left",fonts.small);text(c.ability~="" and c.ability or c.description,555,405,430,"left",fonts.small);text("Click anywhere outside to close",555,730,430,"center",fonts.small)
end
local function drawGraveyardViewOverlay(p)
  drawThemedPanel(180,120,1080,760);text(p.name.."'s Graveyard",210,150,1000,"center",fonts.big);for i,c in ipairs(p.graveyard) do local col=(i-1)%9;local row=math.floor((i-1)/9);drawSingleCard(c,220+col*110,215+row*160,0,false) end
end
local function drawTargetHighlights() if signalTargetCard or equipTargetCard then text("Select a highlighted character  (right-click to cancel)",380,525,680,"center",fonts.big) end end

local function drawTavernPropMug(x,y,drink)
  love.graphics.setColor(.20,.10,.04);love.graphics.rectangle("fill",x-5,y-5,58,66)
  love.graphics.setColor(.48,.26,.10);love.graphics.rectangle("fill",x,y,48,56)
  love.graphics.setColor(.76,.48,.19);love.graphics.rectangle("fill",x+5,y+7,38,42)
  love.graphics.setColor(drink);love.graphics.rectangle("fill",x+7,y+10,34,13)
  love.graphics.setColor(.42,.22,.08);love.graphics.setLineWidth(5);love.graphics.arc("line","open",x+46,y+30,15,-math.pi/2,math.pi/2)
end
local function drawTavernPropSkull(x,y)
  love.graphics.setColor(.18,.10,.05);love.graphics.rectangle("fill",x-4,y-4,90,78)
  love.graphics.setColor(.74,.67,.49);love.graphics.rectangle("fill",x,y,78,62);love.graphics.rectangle("fill",x+20,y+56,38,20)
  love.graphics.setColor(.20,.12,.07);love.graphics.rectangle("fill",x+13,y+18,17,16);love.graphics.rectangle("fill",x+48,y+18,17,16);love.graphics.rectangle("fill",x+29,y+43,20,12)
  love.graphics.setColor(.91,.80,.53);love.graphics.polygon("fill",x+4,y+6,x+18,y-12,x+25,y+8);love.graphics.polygon("fill",x+54,y+8,x+64,y-12,x+75,y+6)
end
local function drawTavernPlaymat()
  love.graphics.setColor(.13,.07,.03);love.graphics.rectangle("fill",0,0,VIRTUAL_WIDTH,VIRTUAL_HEIGHT)
  love.graphics.setColor(.29,.15,.07);love.graphics.rectangle("fill",0,0,VIRTUAL_WIDTH,115);love.graphics.rectangle("fill",0,885,VIRTUAL_WIDTH,115)
  love.graphics.setColor(.48,.28,.12);love.graphics.rectangle("fill",0,104,VIRTUAL_WIDTH,12);love.graphics.rectangle("fill",0,884,VIRTUAL_WIDTH,12)
  love.graphics.setColor(.36,.20,.09);love.graphics.rectangle("fill",65,120,1310,760)
  for y=130,865,58 do love.graphics.setColor(.46,.27,.12);love.graphics.rectangle("fill",75,y,1290,50);love.graphics.setColor(.24,.13,.06);love.graphics.rectangle("fill",75,y+50,1290,8) end
  love.graphics.setColor(.12,.07,.03,.42);love.graphics.rectangle("fill",300,250,840,500)
  love.graphics.setColor(.70,.47,.19,.42);love.graphics.setLineWidth(4);love.graphics.rectangle("line",300,250,840,500)
  drawTavernPropMug(102,142,{.72,.25,.08});drawTavernPropMug(1280,797,{.18,.46,.24});drawTavernPropSkull(1230,145)
  love.graphics.setColor(.12,.06,.03);love.graphics.setLineWidth(10);love.graphics.line(120,790,235,690);love.graphics.line(130,690,245,790)
  love.graphics.setColor(.68,.69,.66);love.graphics.setLineWidth(6);love.graphics.line(112,782,225,682);love.graphics.line(122,682,235,782)
  love.graphics.setColor(.25,.27,.29);love.graphics.polygon("fill",1120,795,1175,760,1230,795,1215,850,1135,850)
  love.graphics.setColor(.54,.57,.58);love.graphics.polygon("fill",1130,795,1175,770,1220,795,1208,838,1142,838);love.graphics.setColor(.13,.15,.16);love.graphics.rectangle("fill",1157,806,36,13)
end
local function drawAlmanac()
  -- Background
  love.graphics.setColor(.06,.08,.12)
  love.graphics.rectangle("fill",0,0,VIRTUAL_WIDTH,VIRTUAL_HEIGHT)
  -- Header bar
  love.graphics.setColor(.14,.09,.05)
  love.graphics.rectangle("fill",0,0,VIRTUAL_WIDTH,70)
  love.graphics.setColor(.6,.4,.15)
  love.graphics.rectangle("fill",0,67,VIRTUAL_WIDTH,3)
  -- Back button
  local backHov=mouseX>=30 and mouseX<=160 and mouseY>=20 and mouseY<=60
  love.graphics.setColor(backHov and {.5,.3,.1} or {.3,.18,.08})
  love.graphics.rectangle("fill",30,20,130,40,6,6)
  love.graphics.setColor(.9,.75,.4)
  love.graphics.setLineWidth(2);love.graphics.rectangle("line",30,20,130,40,6,6)
  love.graphics.setFont(fonts.small);love.graphics.setColor(1,1,.9);love.graphics.printf("← BACK",30,30,130,"center")
  -- Tab buttons
  local tabCards=almanacTab=="cards"
  local tabSkills=almanacTab=="skills"
  love.graphics.setColor(tabCards and {.7,.5,.15} or {.25,.18,.1})
  love.graphics.rectangle("fill",200,20,160,40,6,6)
  love.graphics.setColor(.9,.75,.3);love.graphics.setLineWidth(tabCards and 3 or 1);love.graphics.rectangle("line",200,20,160,40,6,6)
  love.graphics.setColor(1,1,.9);love.graphics.printf("CARDS",200,30,160,"center")
  love.graphics.setColor(tabSkills and {.7,.5,.15} or {.25,.18,.1})
  love.graphics.rectangle("fill",380,20,160,40,6,6)
  love.graphics.setColor(.9,.75,.3);love.graphics.setLineWidth(tabSkills and 3 or 1);love.graphics.rectangle("line",380,20,160,40,6,6)
  love.graphics.setColor(1,1,.9);love.graphics.printf("SKILLS",380,30,160,"center")
  -- Title
  love.graphics.setFont(fonts.big);love.graphics.setColor(.95,.85,.5);love.graphics.printf("ALMANAC",600,22,400,"center")
  -- Content area with scrolling
  love.graphics.setScissor(offsetX,offsetY+75*scale,(VIRTUAL_WIDTH)*scale,(VIRTUAL_HEIGHT-75)*scale)
  love.graphics.push()
  love.graphics.translate(0,-almanacScroll)
  if almanacTab=="cards" then
    -- Gather all cards sorted by group then name
    local allCards={}
    local groups={"Simple","Monkey","Zombie","Fighter"}
    for _,g in ipairs(groups) do
      for _,name in ipairs(GROUP_POOLS[g] or {}) do
        allCards[#allCards+1]=CARD_TEMPLATES[name]
      end
    end
    -- Draw cards in a grid: 6 columns
    local cols=6
    local cellW=220
    local cellH=160
    local startX=40
    local startY=90
    local currentGroup=""
    local row=0
    local col=0
    for _,card in ipairs(allCards) do
      if card then
        -- Group header
        if card.group~=currentGroup then
          if col>0 then row=row+1;col=0 end -- new row for new group
          currentGroup=card.group
          local gy=startY+row*cellH
          love.graphics.setFont(fonts.small)
          love.graphics.setColor(COLORS[currentGroup] or {1,1,1})
          love.graphics.printf("── "..currentGroup:upper().." DECK ──",startX,gy,VIRTUAL_WIDTH-80,"left")
          row=row+1;col=0
        end
        local cx=startX+col*cellW
        local cy=startY+row*cellH
        -- Card background
        local gc=COLORS[card.group] or {.3,.3,.3}
        love.graphics.setColor(gc[1]*.3,gc[2]*.3,gc[3]*.3,.9)
        love.graphics.rectangle("fill",cx,cy,cellW-10,cellH-10,6,6)
        love.graphics.setColor(COLORS[card.rarity] or COLORS.Basic)
        love.graphics.setLineWidth(2);love.graphics.rectangle("line",cx,cy,cellW-10,cellH-10,6,6)
        -- Card info
        love.graphics.setFont(fonts.tiny)
        love.graphics.setColor(1,1,.9);love.graphics.printf(card.name,cx+6,cy+6,cellW-22,"left")
        love.graphics.setColor(.7,.7,.8);love.graphics.printf(card.type.." • "..card.rarity,cx+6,cy+20,cellW-22,"left")
        love.graphics.printf("Cost: "..card.manaCost,cx+6,cy+34,cellW-22,"left")
        if card.type=="Character" or card.type=="Equipment" then
          love.graphics.setColor(1,.5,.35);love.graphics.printf("⚔"..card.attack,cx+6,cy+50,60,"left")
          love.graphics.setColor(.4,1,.5);love.graphics.printf("♥"..card.health,cx+50,cy+50,60,"left")
          love.graphics.setColor(1,.9,.3);love.graphics.printf("⚡"..card.speed,cx+94,cy+50,60,"left")
        end
        -- Skills
        if card.skills and #card.skills>0 then
          local skStr=table.concat(card.skills,", ")
          love.graphics.setColor(.6,.8,1);love.graphics.printf(skStr,cx+6,cy+66,cellW-22,"left")
        end
        -- Ability text
        if card.ability and card.ability~="" then
          love.graphics.setColor(.8,.8,.7,.8);love.graphics.printf(card.ability,cx+6,cy+82,cellW-22,"left")
        end
        -- Mana cost diamond
        love.graphics.setColor(.95,.7,.15);love.graphics.printf("◆"..card.manaCost,cx+cellW-50,cy+6,38,"right")
        col=col+1
        if col>=cols then col=0;row=row+1 end
      end
    end
    -- Set max scroll based on content height
    local totalRows=row+(col>0 and 1 or 0)
    local contentH=startY+totalRows*cellH+100
    almanacScroll=math.min(almanacScroll,math.max(0,contentH-VIRTUAL_HEIGHT))
  elseif almanacTab=="skills" then
    -- Draw skill definitions
    local startY=100
    love.graphics.setFont(fonts.small)
    love.graphics.setColor(.95,.85,.5)
    love.graphics.printf("SKILL REFERENCE",60,startY-20,400,"left")
    for i,skillEntry in ipairs(SKILL_ORDER) do
      local sk=skillEntry.name
      local sy=startY+20+(i-1)*60
      local icon=SKILL_ICON[sk] or "•"
      local desc=SKILL_DESC[sk] or ""
      -- Skill row background
      love.graphics.setColor(.1,.12,.18,.8)
      love.graphics.rectangle("fill",60,sy,VIRTUAL_WIDTH-120,50,6,6)
      love.graphics.setColor(.5,.4,.2,.6)
      love.graphics.setLineWidth(1);love.graphics.rectangle("line",60,sy,VIRTUAL_WIDTH-120,50,6,6)
      -- Icon and name
      love.graphics.setFont(fonts.small)
      love.graphics.setColor(.9,.8,.3)
      love.graphics.printf(icon.."  "..sk,80,sy+8,200,"left")
      -- Description
      love.graphics.setFont(fonts.tiny)
      love.graphics.setColor(.85,.88,.95)
      love.graphics.printf(desc,300,sy+12,VIRTUAL_WIDTH-420,"left")
      -- Divider
      love.graphics.setColor(.3,.25,.15,.4)
      love.graphics.rectangle("fill",80,sy+48,VIRTUAL_WIDTH-160,1)
    end
    local contentH=startY+20+#SKILL_ORDER*60+80
    almanacScroll=math.min(almanacScroll,math.max(0,contentH-VIRTUAL_HEIGHT))
  end
  love.graphics.pop()
  love.graphics.setScissor()
  -- Scroll indicator
  love.graphics.setColor(.5,.4,.2,.5)
  love.graphics.setFont(fonts.tiny)
  love.graphics.printf("Scroll to see more ↓",VIRTUAL_WIDTH-250,VIRTUAL_HEIGHT-25,230,"right")
end
local function drawEntranceTransition()
  local t=entryTransition.progress
  local doorX,doorY,doorW,doorH=255,740,70,130
  local zoom=1+t*5
  love.graphics.push();love.graphics.translate(doorX+doorW/2,doorY+doorH/2);love.graphics.scale(zoom);love.graphics.translate(-doorX-doorW/2,-doorY-doorH/2)
  love.graphics.setColor(.10,.05,.02);love.graphics.rectangle("fill",doorX-8,doorY-8,doorW+16,doorH+16)
  love.graphics.setColor(.35,.18,.07);love.graphics.rectangle("fill",doorX,doorY,doorW*(.5-t*.5),doorH);love.graphics.rectangle("fill",doorX+doorW*(.5+t*.5),doorY,doorW*(.5-t*.5),doorH)
  love.graphics.setColor(.86,.60,.23);love.graphics.rectangle("fill",doorX+doorW*.5-3,doorY,6,doorH)
  love.graphics.pop()
  if t>.58 then love.graphics.setColor(1,.82,.43,math.min(1,(t-.58)/.28));love.graphics.rectangle("fill",0,0,VIRTUAL_WIDTH,VIRTUAL_HEIGHT) end
end

-- ============================================================================
-- LÖVE CALLBACKS
-- ============================================================================

-- Game initialization: setup window, fonts, card data, and initial game state
function love.load()
  math.randomseed(os.time());DATA.loadGameRules();DATA.loadPhaseData();DATA.loadUIText();love.window.setMode(VIRTUAL_WIDTH,VIRTUAL_HEIGHT,{resizable=true,minwidth=720,minheight=500})
  -- Smooth filtering is a better foundation for painted card art and future assets.
  love.graphics.setDefaultFilter("linear","linear")
  fonts={tiny=love.graphics.newFont(10),small=love.graphics.newFont(15),big=love.graphics.newFont(25),pixel=love.graphics.newFont(8)} -- Added pixel font
  resetStorm();DATA.loadSkillData();DATA.loadRarityData();DATA.loadFactionData();loadCardData();DATA.loadDeckData();resetGame()
end

-- Game loop update: handle time-based animations and state changes
function love.update(dt)
  time=time+dt;shake=math.max(0,shake-dt*18);transition=math.max(0,transition-dt*1.8)
  if gameState=="menu" or gameState=="entering" then updateStorm(dt) end
  if entryTransition.active then
    entryTransition.progress=math.min(1,entryTransition.progress+dt/entryTransition.duration)
    if entryTransition.progress>=1 then entryTransition.active=false;gameState="playing" end
  end
  -- Animate health display changes
  for _,p in ipairs(players) do p.displayHealth=p.displayHealth+(p.health-p.displayHealth)*math.min(1,dt*8) end
  -- Update particle effects
  for i=#particles,1,-1 do local p=particles[i];p.life=p.life-dt;p.x=p.x+p.vx*dt;p.y=p.y+p.vy*dt;if p.life<=0 then table.remove(particles,i) end end
  for i=#trails,1,-1 do trails[i].life=trails[i].life-dt;if trails[i].life<=0 then table.remove(trails,i) end end
  updateDrawAnimation(activePlayer(),dt)
  updateCombatFX(dt)
  -- Update card play fly animations
  for i=#playAnimations,1,-1 do
    local a=playAnimations[i]; a.progress=a.progress+dt*3.5
    if a.progress>=1 then
      a.card.playFlying=false -- show card in field again
      a.card.playLand=0.3 -- trigger a brief scale-up "pop" on landing
      table.remove(playAnimations,i)
    end
  end
  -- Decay play-land pop effect on field cards
  for _,p in ipairs(players) do for _,c in ipairs(p.battlefield.characters) do
    if c.playLand and c.playLand>0 then c.playLand=math.max(0,c.playLand-dt*1.5) end
  end end
  -- Update turn banner animation
  if turnBanner.active then
    turnBanner.progress=turnBanner.progress+dt/turnBanner.duration
    if turnBanner.progress>=1 then turnBanner.active=false end
  end
end
-- Main rendering function: handle screen scaling, game states, and visual effects
function love.draw()
  -- Calculate scaling to fit window while maintaining aspect ratio
  local w,h=love.graphics.getDimensions();scale=math.min(w/VIRTUAL_WIDTH,h/VIRTUAL_HEIGHT);offsetX=(w-VIRTUAL_WIDTH*scale)/2;offsetY=(h-VIRTUAL_HEIGHT*scale)/2;love.graphics.push();love.graphics.translate(offsetX,offsetY);love.graphics.scale(scale)
  if gameState=="menu" then drawMenu();love.graphics.pop();return end
  if gameState=="almanac" then drawAlmanac();love.graphics.pop();return end
  if gameState=="entering" then drawMenu();drawEntranceTransition();love.graphics.pop();return end
  love.graphics.translate((math.random()-.5)*shake,(math.random()-.5)*shake) -- Screen shake effect
  -- The completed turn rotates the whole virtual playmat through 180 degrees
  local rotating=transition>0;if rotating then love.graphics.push();love.graphics.translate(VIRTUAL_WIDTH/2,VIRTUAL_HEIGHT/2);love.graphics.rotate(math.pi*transition);love.graphics.translate(-VIRTUAL_WIDTH/2,-VIRTUAL_HEIGHT/2) end
  -- Draw game elements
  drawTavernPlaymat()
  drawOpponentInvertedHand(opponentPlayer());drawBattlefieldGrid();drawUIHeader();drawActiveFannedHand(activePlayer());drawPlayerHealth(activePlayer(),940);drawTargetHighlights()
  if draggedCard then drawSingleCard(draggedCard,mouseX-cardW/2,mouseY-cardH/2,0,true) end
  if drawAnimation.active then
    local t=drawAnimation.progress
    local cx=drawAnimation.startX+(drawAnimation.endX-drawAnimation.startX)*t
    local cy=drawAnimation.startY+(drawAnimation.endY-drawAnimation.startY)*t-math.sin(t*math.pi)*50
    drawSingleCard(drawAnimation.card,cx-cardW/2,cy-cardH/2,0,true)
  end
  -- Card play fly animations (arc from hand drop point to battlefield slot)
  for _,a in ipairs(playAnimations) do
    local t=a.progress
    local ease=t<0.5 and 2*t*t or 1-(-2*t+2)^2/2 -- ease-in-out quad
    local cx=a.startX+(a.endX-a.startX)*ease
    local cy=a.startY+(a.endY-a.startY)*ease-math.sin(t*math.pi)*60
    local sc=1+math.sin(t*math.pi)*0.15 -- slight scale during flight
    love.graphics.push();love.graphics.translate(cx+cardW/2,cy+cardH/2);love.graphics.scale(sc);love.graphics.translate(-cardW/2,-cardH/2)
    drawSingleCard(a.card,0,0,0,true)
    love.graphics.pop()
  end
  -- Draw visual effects (trails and particles)
  for _,t in ipairs(trails) do love.graphics.setColor(.3,.8,1,t.life*.25);love.graphics.circle("fill",t.x,t.y,12*t.life) end
  for _,p in ipairs(particles) do love.graphics.setColor(p.color[1],p.color[2],p.color[3],p.life);text(p.text,p.x-30,p.y,60,"center",fonts.big) end
  -- Valid action highlighting: glow on playable hand cards and attackable enemies
  if not gameOver and not draggedCard then
    local ap=activePlayer()
    if phaseIndex==2 or phaseIndex==3 then
      -- Highlight playable cards in hand with a green glow
      for i,c in ipairs(ap.hand) do
        if canPlay(c) then
          local hx,hy=handPosition(i,#ap.hand)
          love.graphics.setColor(.2,1,.4,.25+math.sin(time*4)*.1)
          love.graphics.setLineWidth(3)
          love.graphics.rectangle("line",hx-3,hy-3,cardW+6,cardH+6,6,6)
        end
      end
    end
    if phaseIndex==3 and selectedAttacker then
      -- Highlight attackable enemy characters with red glow
      local opp=opponentPlayer()
      for i,c in ipairs(opp.battlefield.characters) do
        local cx=LAYOUT.top.chars.x+(i-1)*110
        local cy=LAYOUT.top.chars.y
        love.graphics.setColor(1,.2,.2,.3+math.sin(time*5)*.12)
        love.graphics.setLineWidth(3)
        love.graphics.rectangle("line",cx-3,cy-3,cardW+6,cardH+6,6,6)
      end
    end
  end
  -- Phase indicator: step display at top
  do
    local phases=TURN_PHASES
    local piX,piW=560,320
    local piY=80
    for idx,name in ipairs(phases) do
      local sx=piX+(idx-1)*(piW/#phases)
      local sw=piW/#phases
      local active=idx==phaseIndex
      love.graphics.setColor(active and {.9,.7,.2,.9} or {.3,.3,.35,.6})
      love.graphics.rectangle("fill",sx+2,piY,sw-4,22,4,4)
      love.graphics.setFont(fonts.tiny)
      love.graphics.setColor(active and {0,0,0,1} or {.7,.7,.8,.8})
      love.graphics.printf(name,sx+2,piY+4,sw-4,"center")
      if idx<#phases then
        love.graphics.setColor(.6,.5,.3,.5)
        love.graphics.printf("→",sx+sw-12,piY+4,16,"center")
      end
    end
  end
  -- Phase instructions: help text explaining what to do
  do
    local helpText=PHASE_DEFINITIONS[phaseIndex] and PHASE_DEFINITIONS[phaseIndex].instruction
    if helpText and not gameOver then
      love.graphics.setFont(fonts.tiny)
      love.graphics.setColor(1,1,1,.6)
      love.graphics.printf(helpText,400,108,640,"center")
    end
  end
  -- Turn banner animation
  if turnBanner.active then
    local t=turnBanner.progress
    -- Slide in from left, hold, slide out to right
    local alpha,bx
    if t<0.2 then alpha=t/0.2; bx=-400+400*(t/0.2) -- slide in
    elseif t<0.8 then alpha=1; bx=0 -- hold
    else alpha=1-(t-0.8)/0.2; bx=(t-0.8)/0.2*400 -- slide out
    end
    love.graphics.setColor(.08,.04,.02,alpha*.88)
    love.graphics.rectangle("fill",bx+320,430,800,80,8,8)
    love.graphics.setColor(.9,.7,.15,alpha)
    love.graphics.setLineWidth(3)
    love.graphics.rectangle("line",bx+320,430,800,80,8,8)
    love.graphics.setFont(fonts.big)
    love.graphics.setColor(1,1,1,alpha)
    love.graphics.printf(turnBanner.text,bx+320,450,800,"center")
  end
  -- Tutorial hints (first-time prompts)
  if not gameOver then
    local hint
    if phaseIndex==1 and not tutorialHints.shownDraw and round<=2 then
      hint=DATA.text("tutorial_draw","Click DRAW CARD to begin")
      tutorialHints.shownDraw=true
    elseif phaseIndex==2 and not tutorialHints.shownSetup and round<=2 then
      hint=DATA.text("tutorial_setup","Drag cards onto the field to play them")
      tutorialHints.shownSetup=true
    elseif phaseIndex==3 and not tutorialHints.shownBattle and round<=2 then
      hint=DATA.text("tutorial_battle","Select a character, then select an enemy")
      tutorialHints.shownBattle=true
    end
    if hint then
      love.graphics.setColor(0,0,0,.7)
      love.graphics.rectangle("fill",260,370,920,50,8,8)
      love.graphics.setColor(.9,.8,.3,1)
      love.graphics.setLineWidth(2)
      love.graphics.rectangle("line",260,370,920,50,8,8)
      love.graphics.setFont(fonts.small)
      love.graphics.setColor(1,1,.85,1)
      love.graphics.printf(hint,270,382,900,"center")
    end
  end
  -- Skill tooltip on hovered hand card
  if not draggedCard and not gameOver then
    local ap=activePlayer()
    for i,c in ipairs(ap.hand) do
      local hx,hy=handPosition(i,#ap.hand)
      if mouseX>=hx and mouseX<=hx+cardW and mouseY>=hy-30 and mouseY<=hy+cardH then
        if c.skills and #c.skills>0 then
          local lines={}
          for _,sk in ipairs(c.skills) do
            local icon=SKILL_ICON[sk] or "•"
            local desc=SKILL_DESC[sk] or ""
            lines[#lines+1]=icon.." "..sk..": "..desc
          end
          local tipH=14*#lines+16
          local tipW=260
          local tipX=math.min(hx,VIRTUAL_WIDTH-tipW-10)
          local tipY=hy-tipH-8
          love.graphics.setColor(0,0,0,.85)
          love.graphics.rectangle("fill",tipX,tipY,tipW,tipH,6,6)
          love.graphics.setColor(.8,.65,.2,.9)
          love.graphics.setLineWidth(1)
          love.graphics.rectangle("line",tipX,tipY,tipW,tipH,6,6)
          love.graphics.setFont(fonts.tiny)
          for li,line in ipairs(lines) do
            love.graphics.setColor(1,1,.9,.95)
            love.graphics.printf(line,tipX+8,tipY+6+(li-1)*14,tipW-16,"left")
          end
        end
        break
      end
    end
  end
  -- Draw overlay screens
  if detailViewCard then drawCardDetailOverlay(detailViewCard) end;if equipmentDetailCard then drawEquipmentDetailOverlay(equipmentDetailCard) end;if graveyardViewPlayer then drawGraveyardViewOverlay(graveyardViewPlayer) end
  if gameOver then rect(260,310,920,360,{.02,.03,.07,.94},16);text((winner and winner.name:upper() or "NOBODY").." WINS!",260,405,920,"center",fonts.big);text("Click to start a new game",260,490,920,"center",fonts.small) end
  if rotating then love.graphics.pop() end
  love.graphics.pop()
end
-- ============================================================================
-- INPUT HANDLING
-- ============================================================================

-- Convert screen coordinates to virtual game coordinates
local function toVirtual(x,y) return (x-offsetX)/scale,(y-offsetY)/scale end

-- Find character at given screen coordinates for a specific player's side
local function characterAt(p,x,y,side)
  local l=LAYOUT[side];for i,c in ipairs(p.battlefield.characters) do local cx=l.chars.x+(i-1)*110;if x>=cx and x<=cx+cardW and y>=l.chars.y and y<=l.chars.y+cardH then return c,i end end
end

-- Find equipment at given screen coordinates for a specific player's side
local function equipmentAt(p,x,y,side)
  local l=LAYOUT[side]
  for i,e in ipairs(p.battlefield.equipments) do local ex=l.equip.x+(i-1)*105;if x>=ex and x<=ex+cardW and y>=l.equip.y and y<=l.equip.y+cardH then return e,i end end
end

-- Find card in hand at given screen coordinates
local function handAt(p,x,y) for i,c in ipairs(p.hand) do local hx,hy=handPosition(i,#p.hand);if x>=hx and x<=hx+cardW and y>=hy-35 and y<=hy+cardH then return c,i end end end
-- Main mouse input handler: handles all game interactions based on current state
function love.mousepressed(x,y,b)
  x,y=toVirtual(x,y);mouseX,mouseY=x,y
  -- Menu interaction
  if gameState=="menu" and b==1 then
    -- Settings gear (bottom-right corner) toggles the background/weather panel
    local gx,gy,gr=VIRTUAL_WIDTH-55,VIRTUAL_HEIGHT-55,26
    if (x-gx)^2+(y-gy)^2<=(gr+6)^2 then settingsOpen=not settingsOpen;return end
    if settingsOpen then
      local panelW,panelH=300,240
      local px,py=VIRTUAL_WIDTH-panelW-20,VIRTUAL_HEIGHT-panelH-95
      for i,w in ipairs(WEATHER_TYPES) do
        local oy=py+52+(i-1)*44
        if x>=px+14 and x<=px+panelW-14 and y>=oy and y<=oy+36 then weather=w;ensureWeatherParticles(w);return end
      end
      if not (x>=px and x<=px+panelW and y>=py and y<=py+panelH) then settingsOpen=false end
      return
    end
    local deckPositions={{700,335},{1010,335},{700,470},{1010,470}}
    for i,deckId in ipairs(DECK_ORDER) do
      local dx,dy=deckPositions[i][1],deckPositions[i][2]
      if x>=dx and x<=dx+250 and y>=dy and y<=dy+105 then selectedDeck=deckId;return end
    end
    if x>=760 and x<=1200 and y>=660 and y<=750 then
      resetGame();entryTransition={active=true,progress=0,duration=1.65};gameState="entering"
      return
    end
    -- Almanac button
    if x>=860 and x<=1100 and y>=770 and y<=820 then
      almanacOpen=true;almanacReturnState="menu";almanacScroll=0;almanacTab="cards";gameState="almanac"
      return
    end
    return
  end
  -- Almanac screen input
  if gameState=="almanac" and b==1 then
    -- Back button (top-left)
    if x>=30 and x<=160 and y>=20 and y<=60 then gameState=almanacReturnState;almanacOpen=false;return end
    -- Tab buttons
    if x>=200 and x<=360 and y>=20 and y<=60 then almanacTab="cards";almanacScroll=0;return end
    if x>=380 and x<=540 and y>=20 and y<=60 then almanacTab="skills";almanacScroll=0;return end
    return
  end
  -- Right-click: cancel targeting or show card details
  if b==2 then
    if signalTargetCard then signalTargetCard=nil;return end -- right-click cancels targeting
    if equipTargetCard then equipTargetCard=nil;return end
    local hc=handAt(activePlayer(),x,y);if hc then detailViewCard=hc;return end
    local c=characterAt(activePlayer(),x,y,"bottom")
    if c then if #(c.equipped or {})>0 then equipmentDetailCard=c else detailViewCard=c end;return end
    local e=characterAt(opponentPlayer(),x,y,"top");if e then detailViewCard=e end
    return
  end
  if b~=1 then return end
  -- DEBUG UNDO: clicking the Undo button restores the previous snapshot (works
  -- even on the game-over screen, checked before that screen consumes the click).
  -- Remove this block for the final build.
  if DEBUG_UNDO_ENABLED and x>=18 and x<=168 and y>=16 and y<=58 and #undoStack>0 then undoLastAction();return end
  -- In-game gear menu is separate from the temporary QA controls.
  if x>=248 and x<=290 and y>=16 and y<=58 then
    gameMenuOpen=not gameMenuOpen;qaPanelOpen=false;return
  end
  if gameMenuOpen then
    local function gameMenuHit(by) return x>=GAME_MENU_PANEL.x+12 and x<=GAME_MENU_PANEL.x+GAME_MENU_PANEL.w-12 and y>=by and y<=by+32 end
    if gameMenuHit(GAME_MENU_PANEL.y+42) then
      resetGame();gameMenuOpen=false;qaPanelOpen=false;gameState="playing";turnBanner={active=true,progress=0,text="NEW GAME",duration=1.0};return
    end
    if gameMenuHit(GAME_MENU_PANEL.y+80) then
      gameMenuOpen=false;qaPanelOpen=false;almanacOpen=true;almanacReturnState="playing";almanacScroll=0;almanacTab="cards";gameState="almanac";return
    end
    if gameMenuHit(GAME_MENU_PANEL.y+118) then
      gameMenuOpen=false;qaPanelOpen=false;gameState="menu";return
    end
    if not (x>=GAME_MENU_PANEL.x and x<=GAME_MENU_PANEL.x+GAME_MENU_PANEL.w and y>=GAME_MENU_PANEL.y and y<=GAME_MENU_PANEL.y+GAME_MENU_PANEL.h) then gameMenuOpen=false end
    return
  end
  -- DEBUG QA: gear toggles the mana/draw QA panel; buttons inside apply the
  -- pending value. Remove this block for the final build.
  if DEBUG_QA_ENABLED then
    if x>=178 and x<=238 and y>=16 and y<=58 then
      qaPanelOpen=not qaPanelOpen
      if qaPanelOpen then qaManaValue=activePlayer().mana;qaDrawValue=0 end
      return
    end
    if qaPanelOpen then
      local function hit(bx,by,bw,bh) return x>=bx and x<=bx+bw and y>=by and y<=by+bh end
      if hit(QA_PANEL.x+QA_OFFSETS.minus10,QA_ROW_MANA_Y,36,QA_BTN_H) then qaManaValue=math.max(0,qaManaValue-10);return end
      if hit(QA_PANEL.x+QA_OFFSETS.minus1,QA_ROW_MANA_Y,36,QA_BTN_H) then qaManaValue=math.max(0,qaManaValue-1);return end
      if hit(QA_PANEL.x+QA_OFFSETS.plus1,QA_ROW_MANA_Y,36,QA_BTN_H) then qaManaValue=qaManaValue+1;return end
      if hit(QA_PANEL.x+QA_OFFSETS.plus10,QA_ROW_MANA_Y,36,QA_BTN_H) then qaManaValue=qaManaValue+10;return end
      if hit(QA_PANEL.x+QA_OFFSETS.apply,QA_ROW_MANA_Y,78,QA_BTN_H) then applyQaMana();return end
      if hit(QA_PANEL.x+QA_OFFSETS.minus10,QA_ROW_DRAW_Y,36,QA_BTN_H) then qaDrawValue=math.max(0,qaDrawValue-10);return end
      if hit(QA_PANEL.x+QA_OFFSETS.minus1,QA_ROW_DRAW_Y,36,QA_BTN_H) then qaDrawValue=math.max(0,qaDrawValue-1);return end
      if hit(QA_PANEL.x+QA_OFFSETS.plus1,QA_ROW_DRAW_Y,36,QA_BTN_H) then qaDrawValue=qaDrawValue+1;return end
      if hit(QA_PANEL.x+QA_OFFSETS.plus10,QA_ROW_DRAW_Y,36,QA_BTN_H) then qaDrawValue=qaDrawValue+10;return end
      if hit(QA_PANEL.x+QA_OFFSETS.apply,QA_ROW_DRAW_Y,78,QA_BTN_H) then applyQaDraw();return end
      if not hit(QA_PANEL.x,QA_PANEL.y,QA_PANEL.w,QA_PANEL.h) then qaPanelOpen=false end
      return
    end
  end
  -- Game over: click to return to menu
  if gameOver then gameState="menu";return end
  -- Close overlays
  if detailViewCard then detailViewCard=nil;return end;if equipmentDetailCard then equipmentDetailCard=nil;return end;if graveyardViewPlayer then graveyardViewPlayer=nil;return end
  -- Phase button
  if x>=1210 and x<=1395 and y>=460 and y<=515 then
    if phaseIndex==1 and #activePlayer().deck>0 and not drawAnimation.active then startDrawAnimation(activePlayer())
    elseif phaseIndex==4 then endTurn()
    elseif phaseIndex~=1 then advancePhase() end
    return
  end
  -- Pass turn button
  if x>=1210 and x<=1395 and y>=850 and y<=905 then endTurn();return end
  -- Graveyard view
  if x>=LAYOUT.bottom.grave.x and x<=LAYOUT.bottom.grave.x+cardW and y>=LAYOUT.bottom.grave.y and y<=LAYOUT.bottom.grave.y+cardH then graveyardViewPlayer=activePlayer();return end
  -- Get clicked game objects
  local own,oi=characterAt(activePlayer(),x,y,"bottom");local enemy,ei=characterAt(opponentPlayer(),x,y,"top");local fieldGear,fieldGearIndex=equipmentAt(activePlayer(),x,y,"bottom")
  -- Handle signal targeting
  if signalTargetCard then if own or enemy then applySignalToTarget(own or enemy) end;return end
  -- Handle equipment targeting
  if equipTargetCard then
    if own then
      if equipTargetCard.fromField then attachFieldEquipment(activePlayer(),equipTargetCard.index,own) else playCard(equipTargetCard.index,own) end
      equipTargetCard=nil
    end
    return
  end
  -- Select field equipment for attachment
  if fieldGear then equipTargetCard={card=fieldGear,index=fieldGearIndex,fromField=true};return end
  -- Battle phase: select attackers and resolve attacks
  if phaseIndex==3 then
    if own then selectedAttacker={index=oi,card=own};return end
    if enemy and selectedAttacker then resolveCharacterAttack(selectedAttacker.index,opponentPlayer(),ei);selectedAttacker=nil;return end
    if selectedAttacker and y<440 then resolveCharacterAttack(selectedAttacker.index,opponentPlayer(),nil);selectedAttacker=nil;return end
  end
  -- Card dragging from hand
  local c,i=handAt(activePlayer(),x,y);if c and activePlayer().hasDrawn and phaseIndex<4 then draggedCard=c;dragIndex=i;dragX=x;dragY=y end
end
function love.mousereleased(x,y,b)
  x,y=toVirtual(x,y);if b==1 and draggedCard then
    local own=characterAt(activePlayer(),x,y,"bottom")
    local equipRow=LAYOUT.bottom.equip
    if draggedCard.type=="Equipment" and own then playCard(dragIndex,own)
    elseif draggedCard.type=="Equipment" and x>=equipRow.x and x<=equipRow.x+5*105 and y>=equipRow.y and y<=equipRow.y+cardH then playCard(dragIndex,nil,true)
    elseif y<790 then playCard(dragIndex) else detailViewCard=draggedCard end
    draggedCard=nil;dragIndex=nil
  end
end
function love.mousemoved(x,y,dx,dy) mouseX,mouseY=toVirtual(x,y);if draggedCard then trails[#trails+1]={x=mouseX,y=mouseY,life=.45} end end
function love.wheelmoved(_,y)
  if gameState=="almanac" and y~=0 then almanacScroll=math.max(0,almanacScroll-y*40) end
  if graveyardViewPlayer and y~=0 then end
end
