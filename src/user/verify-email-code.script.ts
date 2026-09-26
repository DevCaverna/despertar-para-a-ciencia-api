export const VERIFY_EMAIL_CODE_SCRIPT = `
local verification = redis.call('GET', KEYS[1])
if not verification then return 0 end

local decodedOk, decoded = pcall(cjson.decode, verification)
if not decodedOk or type(decoded) ~= 'table' or
   type(decoded.codeHash) ~= 'string' or type(decoded.expiresAt) ~= 'number' or
   decoded.expiresAt <= tonumber(ARGV[2]) then
  redis.call('DEL', KEYS[1], KEYS[2])
  return 0
end

local attempts = tonumber(redis.call('GET', KEYS[2]) or '0')
if attempts >= tonumber(ARGV[3]) then
  redis.call('DEL', KEYS[1], KEYS[2])
  return 0
end

if decoded.codeHash ~= ARGV[1] then
  attempts = redis.call('INCR', KEYS[2])
  if attempts == 1 then
    local ttl = redis.call('PTTL', KEYS[1])
    redis.call('EXPIRE', KEYS[2], math.max(1, math.ceil(ttl / 1000)))
  end
  if attempts >= tonumber(ARGV[3]) then redis.call('DEL', KEYS[1], KEYS[2]) end
  return 0
end

redis.call('DEL', KEYS[1], KEYS[2])
return 1
`;
