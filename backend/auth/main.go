package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"brainiac/models"
	auth "brainiac/models/authmodels"

	"github.com/gin-gonic/gin"
	"github.com/gofrs/uuid/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

// @title           Example JWT Auth API
// @version         1.0
// @securityDefinitions.apikey  BearerAuth
// @in header
// @name Authorization

// @description     API для аутентификации и обновления токенов JWT
// @termsOfService  http://swagger.io/terms/

// @contact.name   Konstantin Gerasimov
// @contact.url    https://github.com/Konscig/test-backend

// @license.name  No license

// DatabaseMiddleware создает middleware для Gin, который устанавливает соединение с базой данных в контекст запроса.
//
// Параметры:
//   - db: указатель на объект *gorm.DB (соединение с БД).
//
// Возвращает:
//   - gin.HandlerFunc: middleware, который добавляет базу в контекст c.Set("db", db).
func DatabaseMiddleware(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("db", db)
		c.Next()
	}
}

// extractBearerToken извлекает Bearer токен из заголовка Authorization HTTP запроса.
//
// Параметры:
//   - c: указатель на контекст Gin (*gin.Context).
//
// Возвращает:
//   - строку токена (без префикса "Bearer ").
//   - ошибку, если заголовок отсутствует или формат неверный.
func extractBearerToken(c *gin.Context) (string, error) {
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" {
		return "", fmt.Errorf("authorization header is missing")
	}

	const prefix = "Bearer "
	if !strings.HasPrefix(authHeader, prefix) {
		return "", fmt.Errorf("invalid authorization header format")
	}

	token := strings.TrimPrefix(authHeader, prefix)
	if token == "" {
		return "", fmt.Errorf("token is missing")
	}

	return token, nil
}

// CheckTokenMiddleware создает middleware, которое проверяет JWT токен определенного типа (access или refresh).
//
// Параметры:
//   - tokenType: строка, тип токена ("access" или "refresh").
//
// Возвращает:
//   - gin.HandlerFunc, который:
//   - извлекает токен из заголовка Authorization,
//   - валидирует токен,
//   - устанавливает в контекст userID, tokenType,
//   - для refresh-токена дополнительно ищет токен в БД и устанавливает его в контекст.
//   - Если токен невалидный или просроченный, возвращает 401 ошибку и прерывает цепочку.
func CheckTokenMiddleware(tokenType string) gin.HandlerFunc {
	return func(c *gin.Context) {
		db, ok := c.Value("db").(*gorm.DB)
		if !ok {
			c.JSON(500, gin.H{"error": "DB connection not found"})
			return
		}

		bearerToken, err := extractBearerToken(c)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to extract token"})
			c.Abort()
			return
		}

		var token *jwt.Token

		if tokenType == "refresh" {
			clearToken, err := base64.StdEncoding.DecodeString(bearerToken)
			if err != nil {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "token decoding error"})
				c.Abort()
				return
			}
			token, err = checkToken(string(clearToken), tokenType)
			if err != nil {
				c.JSON(http.StatusUnauthorized, gin.H{"error ": "failed to check token"})
				c.Abort()
				return
			}
			sub, err := extractSub(token)
			if err != nil {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "failed to extract sub"})
				c.Abort()
				return
			}
			c.Set("userid", sub)
			c.Set("tokenType", tokenType)

			var refreshTokens []auth.RefreshToken
			err = db.Where("user_id = ? AND expired = false", sub).Find(&refreshTokens).Error
			if err != nil {
				c.JSON(401, gin.H{"error": "failed to find refresh tokens"})
				c.Abort()
				return
			}

			shaToken := sha256.Sum256([]byte(bearerToken))
			var spottedToken *auth.RefreshToken
			for i := range refreshTokens {
				err = bcrypt.CompareHashAndPassword([]byte(refreshTokens[i].TokenHash), shaToken[:])
				if err == nil {
					spottedToken = &refreshTokens[i]
					break
				}
			}
			if spottedToken == nil {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "failed to find refresh token in db"})
				c.Abort()
				return
			}
			c.Set("spottedToken", spottedToken)

			c.Next()
		} else if tokenType == "access" {

			token, err = checkToken(bearerToken, tokenType)
			if err != nil {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "not access token"})
				c.Abort()
				return
			}
			sub, err := extractSub(token)
			if err != nil {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "failed to extract sub"})
				c.Abort()
				return
			}
			c.Set("userid", sub)
			c.Set("tokenType", tokenType)
			c.Next()
		} else {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			c.Abort()
			return
		}
	}
}

// NotRevokedTokenMiddleware создает middleware, которое проверяет, что access-токен не был отозван.
// Проверяет, что дата выпуска токена (iat) не раньше времени TokenValidAfter пользователя из БД.
// Если токен отозван или пользователь не найден — возвращает ошибку 401.
// Если все ок — добавляет пользователя в контекст.
func NotRevokedTokenMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		db, ok := c.Value("db").(*gorm.DB)
		if !ok {
			c.JSON(500, gin.H{"error": "DB connection not found"})
			return
		}

		var token *jwt.Token

		bearerToken, err := extractBearerToken(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			c.Abort()
			return
		}
		token, err = checkToken(bearerToken, "access")
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			c.Abort()
			return
		}

		sub, err := extractSub(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			c.Abort()
			return
		}

		iat, err := getIat(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			c.Abort()
			return
		}

		var user auth.User
		err = db.Where("id = ?", sub).First(&user).Error
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
			c.Abort()
			return
		}
		if iat.Before(user.TokenValidAfter) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "token has been revoked"})
			c.Abort()
			return
		}
		c.Set("user", &user)
		c.Next()
	}
}

// generateTokens создает пару access и refresh токенов для пользователя с заданным userID.
//
// Формирует access токен, refresh токен, кодирует refresh в base64,
// хэширует sha256 и bcrypt для безопасного хранения в базе.
//
// Параметры:
//   - userID: идентификатор пользователя, для которого создаются токены.
//
// Возвращает:
//   - accessToken: строка JWT access токена,
//   - refreshTokenB64: строка base64-кодированного refresh токена,
//   - refreshHash: bcrypt-хэш sha256-образа refresh токена,
//   - err: ошибка, если что-то пошло не так.
func generateTokens(userID uuid.UUID) (string, string, []byte, error) {

	accessToken, err := generateAccessToken(userID.String())
	if err != nil {
		return "", "", nil, fmt.Errorf("failed to create access token: %v", err)
	}
	refreshToken, err := generateRefreshToken(userID.String(), time.Now().Add(time.Hour*24*30).Unix())
	if err != nil {
		return "", "", nil, fmt.Errorf("failed to create refresh token: %v", err)
	}

	b64Token := base64.StdEncoding.EncodeToString([]byte(refreshToken))
	shaToken := sha256.Sum256([]byte(b64Token))
	refreshHash, err := bcrypt.GenerateFromPassword([]byte(shaToken[:]), bcrypt.DefaultCost)
	if err != nil {
		return "", "", nil, fmt.Errorf("failed to hash refresh token: %v", err)
	}

	return accessToken, b64Token, refreshHash, nil
}

// main загружает переменные окружения из .env, инициализирует подключение к БД и Gin router,
// настраивает маршруты и middleware для разных групп: noTokenGroup, accessTokenGroup, refreshTokenGroup,
// и запускает HTTP сервер на host и port из .env.
func main() {
	godotenv.Load(".env")

	pg_user := os.Getenv("PG_USER")
	pg_password := os.Getenv("PG_PASSWORD")
	pg_db := os.Getenv("PG_DB")
	pg_port := os.Getenv("PG_PORT")
	pg_host := os.Getenv("PG_HOST")

	engine := models.Engine{
		Name:     "PostgreSQL",
		User:     pg_user,
		Password: pg_password,
		Database: pg_db,
		Uri:      fmt.Sprintf("%s:%s", pg_host, pg_port),
	}

	db, err := engine.CreateEngine()
	if err != nil {
		panic("failed to connect database")
	}

	db.AutoMigrate(&auth.User{}, &auth.RefreshToken{})
	router := gin.Default()
	router.Use(DatabaseMiddleware(db))

	noTokenGroup := router.Group("/login")
	{
		noTokenGroup.POST("", postLogin)
	}

	accessTokenGroup := router.Group("/user")
	accessTokenGroup.Use(CheckTokenMiddleware("access"), NotRevokedTokenMiddleware())
	{
		accessTokenGroup.GET("/uuid/", getUserId)
		accessTokenGroup.GET("/logout/", getLogout)
	}

	refreshTokenGroup := router.Group("/refresh")
	refreshTokenGroup.Use(CheckTokenMiddleware("refresh"))
	{
		refreshTokenGroup.POST("", postRefresh)
	}

	router.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	host := fmt.Sprintf("%s:%s", os.Getenv("HOST"), os.Getenv("PORT"))
	router.Run(host)
}

type BadRequestResponse struct {
	Error string `json:"error" example:"bad request"`
}

type UnauthorizedResponse struct {
	Error string `json:"error" example:"unauthorized"`
}

type InternalServerErrorResponse struct {
	Error string `json:"error" example:"internal server error"`
}

type FailedToExtractToken struct {
	Error string `json:"error" example:"failed to extract token"`
}
type FailedToParseToken struct {
	Error string `json:"error" example:"failed to parse token"`
}

type NotAnAccess struct {
	Error string `json:"error" example:"not an access token"`
}

type LoginRequest struct {
	Username string `json:"username" example:"Kostya"`
	Password string `json:"password" example:"1234"`
}

type LoginResponse struct {
	AccessToken  string `json:"access_token" example:"eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NTIwMzEzODAsImlhdCI6MTc1MjAzMDQ4MCwic3ViIjoiZDNlZDZiNGUtZWZhMC00ZDk5LWI5ZWItNTNhZTRmYmJlMTU5IiwidHlwZSI6ImFjY2VzcyJ9.M0NnPpfBIOTRJdpPLObAEpjAz7rdYe2CeCmcMlFHstVHXxFI224wmvnx0OG_80r3pY0cGaMMnGVnqW6dg5-ysQ"`
	RefreshToken string `json:"refresh_token" example:"ZXlKaGJHY2lPaUpJVXpVeE1pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SmxlSEFpT2pFM05UUTJNakkwT0RBc0ltbGhkQ0k2TVRjMU1qQXpNRFE0TUN3aWMzVmlJam9pWkRObFpEWmlOR1V0WldaaE1DMDBaRGs1TFdJNVpXSXROVE5oWlRSbVltSmxNVFU1SWl3aWRIbHdaU0k2SW5KbFpuSmxjMmdpZlEuUUtJQTViczZwMkxxZHdxUUwybUUySGtGWjFITnVldU1VNlpScXVndDRUbUg4QkFCVFpLSTdkNEZLX3hDTGo5SnhDVjItbXp5a1h4RG90NTFOUXl1RVE="`
}

// postLogin godoc
// @Summary      Вход пользователя и получение токенов
// @Description  Принимает username и password, возвращает access и refresh токены
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        credentials  body      LoginRequest  				true  		"Данные для входа"
// @Success      200          {object}  LoginResponse 	   						"access_token и refresh_token"
// @Failure      400          {object}  BadRequestResponse  					"ошибка запроса"
// @Failure      401          {object}  UnauthorizedResponse  					"неверные учетные данные"
// @Failure      500          {object}  InternalServerErrorResponse 			"внутренняя ошибка сервера"
// @Router       /login [post]
func postLogin(c *gin.Context) {
	db, ok := c.Value("db").(*gorm.DB)
	if !ok {
		c.JSON(500, gin.H{"error": "DB connection not found"})
		return
	}
	userAgent := c.GetHeader("User-Agent")
	ipAddr := c.ClientIP()

	var userData LoginRequest
	err := c.ShouldBindJSON(&userData)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	password := []byte(userData.Password)

	var user auth.User
	err = db.Where("username = ?", userData.Username).First(&user).Error
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid username or password!"})
		return
	}
	err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid username or password!!"})
		return
	}
	accessToken, refreshTokenB64, refreshHash, err := generateTokens(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err})
		return
	}

	newRefreshToken := auth.RefreshToken{
		UserID:    user.ID,
		TokenHash: string(refreshHash),
		UserAgent: userAgent,
		IPAddress: ipAddr,
	}

	result := db.Create(&newRefreshToken)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save refresh token"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"refresh_token": refreshTokenB64, "access_token": accessToken})
}

type RefreshRequest struct {
	UserAgent string `json:"User-Agent" example:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537."`
	IPAddress string `json:"X-Forwarded-For" example:"192.168.1.1"`
}

type RefreshResponse struct {
	AccessToken  string `json:"access_token" example:"eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NTIwNjM2NjEsImlhdCI6MTc1MjA2Mjc2MSwic3ViIjoiZDNlZDZiNGUtZWZhMC00ZDk5LWI5ZWItNTNhZTRmYmJlMTU5IiwidHlwZSI6ImFjY2VzcyJ9.BQ9D350iGisxqGNJoVENkpcn2zrCM5rgx2UsFZ8KJvTbtzmDjAqugFSwzdGduglCKZuS2bpcqGU5zAuqO2aMbQ"`
	RefreshToken string `json:"refresh_token" example:"ZXlKaGJHY2lPaUpJVXpVeE1pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SmxlSEFpT2pFM05UUTJOVFEzTmpFc0ltbGhkQ0k2TVRjMU1qQTJNamMyTVN3aWMzVmlJam9pWkRObFpEWmlOR1V0WldaaE1DMDBaRGs1TFdJNVpXSXROVE5oWlRSbVltSmxNVFU1SWl3aWRIbHdaU0k2SW5KbFpuSmxjMmdpZlEuZi1wSGlpbm9McHhBakV5eFlWcVdmRFRhVjc5cXRaS3pFUURaSXZJU1F3NWpvVDBMVTF5R0FCbGRIT2JucEV6M01DRmRQeFRhdC1kWjRxWjYxb3dlUEE="`
}

// postRefresh godoc
// @Summary      Обновление токенов (refresh)
// @Description  Принимает refresh токен в Authorization заголовке (Bearer <refresh_token>), проверяет его и выдает новую пару (access/refresh) токенов
// @Tags         refresh
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        Refresh  		body      RefreshRequest  				true  	"User-Agent и IP адрес"
// @Success      200  			{object}  RefreshResponse  						"новые access и refresh токены"
// @Failure      401  			{object}  UnauthorizedResponse 					"неавторизован"
// @Failure      500  			{object}  FailedToParseToken 					"ошибка парсинга токена"
// @Failure      500  			{object}  InternalServerErrorResponse  			"внутренняя ошибка сервера"
// @Router       /refresh [post]
func postRefresh(c *gin.Context) {
	db, ok := c.Value("db").(*gorm.DB)
	if !ok {
		c.JSON(500, gin.H{"error": "DB connection not found"})
		return
	}

	tokenValue, ok := c.Get("spottedToken")
	if !ok {
		c.JSON(401, gin.H{"error": "Unauthorized"})
		return
	}

	oldRefreshToken, ok := tokenValue.(*auth.RefreshToken)
	if !ok {
		c.JSON(401, gin.H{"error": "Unauthorized"})
		return
	}

	incomeUserAgent := c.GetHeader("User-Agent")
	incomeIPAddress := c.ClientIP()
	webhookUrl := os.Getenv("WEBHOOK")

	if incomeUserAgent != oldRefreshToken.UserAgent {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Your User-Agent has been changed"})
		oldRefreshToken.Expired = true
		err := db.Save(oldRefreshToken).Error
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save refresh token"})
			return
		}
		return
	}

	if incomeIPAddress != oldRefreshToken.IPAddress {
		payload := map[string]string{
			"user_id": oldRefreshToken.UserID.String(),
			"new_ip":  oldRefreshToken.IPAddress,
			"old_ip":  incomeIPAddress,
			"msg":     "IP has been changed",
		}
		jsonPayload, _ := json.Marshal(payload)
		_, err := http.Post(webhookUrl, "application/json", bytes.NewBuffer(jsonPayload))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to send webhook"})
			return
		}
	}

	oldRefreshToken.Expired = true
	err := db.Save(oldRefreshToken).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save refresh token"})
		return
	}

	accessToken, b64Token, refreshHash, err := generateTokens(oldRefreshToken.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error 10": err})
		return
	}

	newRefreshToken := auth.RefreshToken{
		UserID:    oldRefreshToken.UserID,
		TokenHash: string(refreshHash),
		UserAgent: incomeUserAgent,
		IPAddress: incomeIPAddress,
	}

	err = db.Create(&newRefreshToken).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save refresh token"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"refresh_token": b64Token, "access_token": accessToken})

}

type GetUserIdResponse struct {
	UserID string `json:"userid" example:"d3ed6b4e-efa0-4d99-b9eb-53ae4fbbe159"`
}

// getUserId godoc
// @Summary      Получить ID пользователя
// @Description  Защищенный маршрут, возвращает ID пользователя из access токена
// @Tags         user
// @Produce      json
// @Security     BearerAuth
// @Success      200  			{object}  	GetUserIdResponse  					"userid"
// @Failure      401  			{object}  	UnauthorizedResponse 				"неавторизован"
// @Failure      401  			{object}  	NotAnAccess 						"не является access токеном"
// @Failure      500  			{object}  	FailedToExtractToken 				"ошибка извлечения токена"
// @Failure      500  			{object}  	InternalServerErrorResponse  		"ошибка получения userid"
// @Router       /user/uuid/ [get]
func getUserId(c *gin.Context) {
	sub, ok := c.Get("userid")
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get user id"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"userid": sub})
}

type GetLogoutResponse struct {
	Message string `json:"message" example:"successful logout"`
}

// getLogout godoc
// @Summary      Выход из системы (logout)
// @Description  Истекает текущий refresh токен и помечает его как просроченный
// @Tags         user
// @Produce      json
// @Security     BearerAuth
// @Success      200  			{object}  	GetLogoutResponse  					"успешный выход"
// @Failure      401  			{object}  	UnauthorizedResponse  				"неавторизован"
// @Failure      500  			{object}  	InternalServerErrorResponse  		"ошибка сервера"
// @Router       /user/logout/ [get]
func getLogout(c *gin.Context) {
	db, ok := c.Value("db").(*gorm.DB)
	if !ok {
		c.JSON(500, gin.H{"error": "DB connection not found"})
		return
	}

	tokenType, ok := c.Get("tokenType")
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get token type"})
		return
	}

	if tokenType == "access" {
		sub, ok := c.Get("userid")
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get user id"})
			return
		}

		user, ok := c.Get("user")
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get user"})
			return
		}

		err := db.Model(user).Update("token_valid_after", time.Now()).Error
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update token valid after"})
			return
		}

		err = db.Where("user_id = ?", sub).Delete(&auth.RefreshToken{}).Error
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete refresh tokens"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "logged out"})
		return
	}
}
