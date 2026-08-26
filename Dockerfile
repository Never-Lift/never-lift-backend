FROM eclipse-temurin:21-jdk-alpine AS build

WORKDIR /workspace

COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw --batch-mode dependency:go-offline

COPY src/ src/
COPY contracts/module-2/v1/ contracts/module-2/v1/
COPY contracts/module-2/v2/ contracts/module-2/v2/
RUN ./mvnw --batch-mode clean package

FROM eclipse-temurin:21-jre-alpine

RUN addgroup -S spring && adduser -S spring -G spring
WORKDIR /app

COPY --from=build /workspace/target/never-lift-backend-*.jar app.jar

USER spring:spring
EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
