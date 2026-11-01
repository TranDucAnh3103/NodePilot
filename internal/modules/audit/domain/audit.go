package domain

import "time"

type AuditEvent struct {
	ID                  string    `json:"id"`
	Timestamp           time.Time `json:"timestamp"`
	ActorID             string    `json:"actorId"`
	ActorUsername       string    `json:"actorUsername"`
	Verb                string    `json:"verb"`
	Target              string    `json:"target"`
	TargetType          string    `json:"targetType"`
	TargetID            string    `json:"targetId"`
	Result              string    `json:"result"` // "success", "denied", "failed"
	RequestID           string    `json:"requestId"`
	IPAddress           string    `json:"ipAddress"`
	DetailsRedactedJSON string    `json:"detailsRedactedJson,omitempty"`
}

type AuditFilter struct {
	Keyword   string    `json:"keyword"`
	Verb      string    `json:"verb"`
	Result    string    `json:"result"`
	From      time.Time `json:"from"`
	To        time.Time `json:"to"`
	Page      int       `json:"page"`
	PageSize  int       `json:"pageSize"`
}
